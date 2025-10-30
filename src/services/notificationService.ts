import { getRedisClient } from "config/redis";
import { EmailMessage } from "interfaces/email";

export enum EmailPriority {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

// Base priority scores
const BASE_PRIORITY_SCORES = {
  [EmailPriority.HIGH]: 5,
  [EmailPriority.MEDIUM]: 2,
  [EmailPriority.LOW]: 1,
};

// Age multipliers: older emails get higher scores (more urgent to notify)
// Age is calculated from email sent date (headers.date) to now
const AGE_MULTIPLIERS = {
  VERY_OLD: 2.0,    // > 24 hours old
  OLD: 1.5,         // 12-24 hours old
  MODERATE: 1.2,    // 6-12 hours old
  RECENT: 1.0,      // < 6 hours old
};

const ACCUMULATED_SCORE_THRESHOLD = 10;

// User-scoped Redis keys for isolation
const SCORE_KEY = (userId: string) => `email:accumulated:score:${userId}`;
const NOTIFICATION_DEBOUNCE_KEY = (userId: string) => `notification:sent:${userId}`;
const DEBOUNCE_TTL_SECONDS = 60; 

export class NotificationService {
  private redis = getRedisClient();

  //better the implementation later by redis list or set
  // Store emails per user
  private userEmails: Map<string, EmailMessage[]> = new Map();

  /**
   * Calculate age multiplier based on how old the email is
   * Handles RFC 2822 date format with timezone (e.g., "Mon, 27 Oct 2025 20:18:10 +0530")
   */
  private getAgeMultiplier(emailDate: string | null | undefined): number {
    if (!emailDate) {
      return AGE_MULTIPLIERS.RECENT; // Default to recent if no date
    }

    try {
      // Parse RFC 2822 date format (JavaScript Date handles this natively)
      const sentDate = new Date(emailDate);

      // Validate the parsed date
      if (isNaN(sentDate.getTime())) {
        console.warn(`[notification-service] Invalid email date: ${emailDate}`);
        return AGE_MULTIPLIERS.RECENT;
      }

      const now = new Date();
      const ageInMilliseconds = now.getTime() - sentDate.getTime();
      const ageInHours = ageInMilliseconds / (1000 * 60 * 60);

      // Handle future dates (clock skew or timezone issues)
      if (ageInHours < 0) {
        console.warn(`[notification-service] Email date is in the future: ${emailDate}. Treating as recent.`);
        return AGE_MULTIPLIERS.RECENT;
      }

      if (ageInHours > 24) {
        return AGE_MULTIPLIERS.VERY_OLD;
      } else if (ageInHours > 12) {
        return AGE_MULTIPLIERS.OLD;
      } else if (ageInHours > 6) {
        return AGE_MULTIPLIERS.MODERATE;
      } else {
        return AGE_MULTIPLIERS.RECENT;
      }
    } catch (error) {
      console.error(`[notification-service] Error parsing email date: ${emailDate}`, error);
      return AGE_MULTIPLIERS.RECENT;
    }
  }


  private getAgeString(emailDate: string | null | undefined): string {
    if (!emailDate) return "unknown";

    try {
      const sentDate = new Date(emailDate);
      if (isNaN(sentDate.getTime())) return "invalid";

      const now = new Date();
      const ageInMinutes = (now.getTime() - sentDate.getTime()) / (1000 * 60);

      if (ageInMinutes < 60) {
        return `${Math.round(ageInMinutes)}m`;
      }

      const ageInHours = ageInMinutes / 60;
      if (ageInHours < 24) {
        return `${Math.round(ageInHours)}h`;
      }

      const ageInDays = ageInHours / 24;
      return `${Math.round(ageInDays)}d`;
    } catch {
      return "error";
    }
  }

  /**
   * Calculate score based on priority and age
   */
  private calculateScore(priority: EmailPriority, email: EmailMessage): number {
    const baseScore = BASE_PRIORITY_SCORES[priority];
    const ageMultiplier = this.getAgeMultiplier(email.headers.date);
    const finalScore = Math.round(baseScore * ageMultiplier);

    return finalScore;
  }

  async incrementAndCheckThreshold(priority: EmailPriority, email: EmailMessage): Promise<void> {
    const userId = email.user_id;
    const score = this.calculateScore(priority, email);
    const newScore = await this.redis.incrby(SCORE_KEY(userId), score);

    // Initialize user's email array if it doesn't exist
    if (!this.userEmails.has(userId)) {
      this.userEmails.set(userId, []);
    }
    this.userEmails.get(userId)!.push(email);

    const ageMultiplier = this.getAgeMultiplier(email.headers.date);
    const ageString = this.getAgeString(email.headers.date);
    console.log(
      `[notification-service] User: ${userId} | Email UID: ${email.uid} | Priority: ${priority} | Age: ${ageString} (${ageMultiplier}x) | Score: ${score} points | Total: ${newScore}/${ACCUMULATED_SCORE_THRESHOLD}`
    );

    // Check if threshold is reached
    if (newScore >= ACCUMULATED_SCORE_THRESHOLD) {
      // Try to acquire the debounce lock
      // NX = only set if key doesn't exist (not in debounce period)
      const canNotify = await this.redis.set(
        NOTIFICATION_DEBOUNCE_KEY(userId),
        "1",
        "EX",
        DEBOUNCE_TTL_SECONDS,
        "NX"
      );

      // If we acquired the lock (not in debounce period), send notification
      if (canNotify === "OK") {
        this.sendNotification(userId, newScore);
        await this.redis.set(SCORE_KEY(userId), "0");
      } else {
        // Debounce is active - keep accumulating
        console.log(
          `[notification-service] User: ${userId} | Score threshold reached (${newScore}) but in debounce period. Emails will accumulate.`
        );
      }
    }
  }


  private sendNotification(userId: string, accumulatedScore: number): void {
    const timestamp = new Date().toISOString();
    const userEmails = this.userEmails.get(userId) || [];

    console.log(
      `\n${"=".repeat(60)}\n` +
        `[NOTIFICATION] ${timestamp}\n` +
        `User ID: ${userId}\n` +
        `Accumulated Score Threshold Reached: ${accumulatedScore} points\n` +
        `Total Emails in Batch: ${userEmails.length}\n` +
        `${"=".repeat(60)}\n`
    );

    userEmails.forEach((email: EmailMessage) => {
      console.log(
        `Email UID: ${email.uid}\n` +
        `Account: ${email.account}\n` +
        `Email Subject: ${email.headers.subject}\n` +
        `Email From: ${email.headers.from}\n` +
        `Email To: ${email.headers.to.join(", ")}\n` +
        `Email Date: ${email.headers.date}\n` +
        `-------------------------\n`
      );
    });

    // Clear this user's email batch
    this.userEmails.set(userId, []);
  }


  async getCurrentScore(userId: string): Promise<number> {
    const score = await this.redis.get(SCORE_KEY(userId));
    return score ? parseInt(score, 10) : 0;
  }

  async resetScore(userId: string): Promise<void> {
    await this.redis.set(SCORE_KEY(userId), "0");
    this.userEmails.set(userId, []);
    console.log(`[notification-service] User: ${userId} | Reset accumulated score to 0`);
  }

  async getScoreStatus(userId: string): Promise<{
    userId: string;
    currentScore: number;
    threshold: number;
    percentageFilled: number;
  }> {
    const currentScore = await this.getCurrentScore(userId);
    const percentageFilled = (currentScore / ACCUMULATED_SCORE_THRESHOLD) * 100;

    return {
      userId,
      currentScore,
      threshold: ACCUMULATED_SCORE_THRESHOLD,
      percentageFilled: Math.round(percentageFilled),
    };
  }
}
