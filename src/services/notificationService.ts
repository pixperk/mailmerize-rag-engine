import { getRedisClient } from "config/redis";

export enum EmailPriority {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

const NOTIFICATION_THRESHOLDS = {
  [EmailPriority.HIGH]: 1,
  [EmailPriority.MEDIUM]: 2,
  [EmailPriority.LOW]: 5,
};

const COUNTER_KEY_PREFIX = "email:priority:count:";
const NOTIFICATION_DEBOUNCE_KEY_PREFIX = "notification:sent:";
const DEBOUNCE_TTL_SECONDS = 60; 

export class NotificationService {
  private redis = getRedisClient();

  async incrementAndCheckThreshold(priority: EmailPriority): Promise<void> {
    const counterKey = `${COUNTER_KEY_PREFIX}${priority}`;
    const debounceKey = `${NOTIFICATION_DEBOUNCE_KEY_PREFIX}${priority}`;
    const newCount = await this.redis.incr(counterKey);

    const threshold = NOTIFICATION_THRESHOLDS[priority];

  
    if (newCount >= threshold) {

      const setResult = await this.redis.set(
        debounceKey,
        "1",
        "EX",
        DEBOUNCE_TTL_SECONDS,
        "NX"
      );
      
      if (setResult === "OK") {
        this.sendNotification(priority, newCount);
        await this.redis.set(counterKey, "0");
      }
    }
  }

 
  private sendNotification(priority: EmailPriority, count: number): void {
    const timestamp = new Date().toISOString();
    console.log(
      `\n${"=".repeat(60)}\n` +
        `[NOTIFICATION] ${timestamp}\n` +
        `Priority: ${priority.toUpperCase()}\n` +
        `Threshold reached: ${count} emails processed\n` +
        `${"=".repeat(60)}\n`
    );
  }

 
  async getCurrentCount(priority: EmailPriority): Promise<number> {
    const counterKey = `${COUNTER_KEY_PREFIX}${priority}`;
    const count = await this.redis.get(counterKey);
    return count ? parseInt(count, 10) : 0;
  }


  async resetCounter(priority: EmailPriority): Promise<void> {
    const counterKey = `${COUNTER_KEY_PREFIX}${priority}`;
    await this.redis.set(counterKey, 0);
    console.log(`[notification-service] Reset counter for ${priority}`);
  }

  
  async resetAllCounters(): Promise<void> {
    await Promise.all([
      this.resetCounter(EmailPriority.HIGH),
      this.resetCounter(EmailPriority.MEDIUM),
      this.resetCounter(EmailPriority.LOW),
    ]);
  }

 async getAllCounts(): Promise<Record<EmailPriority, number>> {
    const [high, medium, low] = await Promise.all([
      this.getCurrentCount(EmailPriority.HIGH),
      this.getCurrentCount(EmailPriority.MEDIUM),
      this.getCurrentCount(EmailPriority.LOW),
    ]);

    return {
      [EmailPriority.HIGH]: high,
      [EmailPriority.MEDIUM]: medium,
      [EmailPriority.LOW]: low,
    };
  }
}
