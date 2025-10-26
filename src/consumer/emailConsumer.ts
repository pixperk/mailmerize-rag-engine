import { rabbitMQ } from "config/rabbit";
import { EmailMessage } from "interfaces/email";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import {
  NotificationService,
  EmailPriority,
} from "services/notificationService";

dotenv.config();

const notificationService = new NotificationService();

const SYSTEM_PROMPT = `
you are "MAILMERIZER", an assistant that summarizes email content.  
you'll receive an object implementing the following interface:

interface emailMessage {
  from: string;
  to: string[];
  subject: string;
  date: string;
  body: {
    text?: string;       // plain text version
    html?: string;       // raw html if available
  };
  attachments?: {
    filename: string;
    mimeType: string;
    size: number;        // in bytes
  }[];
}

your job is to analyze and tag the priority of the email as HIGH, MEDIUM, or LOW based on its content and sender.
do not return anything other than these exact priority labels: "high", "medium", "low".


GUIDELINES

1. if both body.text and body.html exist, prefer body.text for readability.  
2. give only the priority label as output, nothing else. 
3. respond in lowercase only: "high", "medium", or "low".
---
`;

const QUEUE = process.env.EMAIL_QUEUE || "email_tasks";

export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export async function startEmailConsumer() {
  const channel = rabbitMQ.getChannel();
  await channel.assertQueue(QUEUE, { durable: true });

  console.log(`[email-consumer] listening on queue: ${QUEUE}`);

  channel.consume(
    QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const payload: EmailMessage = JSON.parse(msg.content.toString());
        await processEmail(payload);

        channel.ack(msg);
      } catch (error) {
        console.error(`[email-consumer] error processing message: `, error);
        channel.nack(msg, false, true);
        //add a dead-letter queue mechanism later
      }
    },
    { noAck: false }
  );
}

async function processEmail(email: EmailMessage) {
  //add to database later
  try {
    //const priority = await categorizeEmailPriority(email);
    const priority = await generateRandomPriority();
    console.log(
      `[email-consumer] Email UID: ${email.uid} categorized as priority: ${priority}`
    );

    // Increment counter and check if notification threshold is reached
    await notificationService.incrementAndCheckThreshold(priority);
  } catch (error) {
    throw new Error(`Failed to process email UID: ${email.uid}: ${error}`);
  }
}

async function categorizeEmailPriority(
  email: EmailMessage
): Promise<EmailPriority> {
  try {
    const userQuery = `Here is the email data:
    ${JSON.stringify(email)}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userQuery },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const priorityLabel = completion.choices[0].message.content;
    if (!priorityLabel) {
      throw new Error("No priority label returned from LLM");
    }
    const priority = priorityLabel.trim().toLowerCase();
    switch (priority) {
      case EmailPriority.HIGH:
        return EmailPriority.HIGH;
      case EmailPriority.MEDIUM:
        return EmailPriority.MEDIUM;
      case EmailPriority.LOW:
        return EmailPriority.LOW;
      default:
        throw new Error(`Unexpected priority label: ${priorityLabel}`);
    }
  } catch (error) {
    throw new Error(`Failed to categorize email priority: ${error}`);
  }
}


async function generateRandomPriority(): Promise<EmailPriority> {
  const priorities = [
    EmailPriority.HIGH,
    EmailPriority.MEDIUM,
    EmailPriority.LOW,
  ];
  const randomIndex = Math.floor(Math.random() * priorities.length);
  return priorities[randomIndex];
}