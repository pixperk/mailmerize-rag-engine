import { getRabbitChannel } from "config/rabbit";

const QUEUE = process.env.EMAIL_QUEUE || 'email_tasks';

export async function startEmailConsumer(){
    const channel = getRabbitChannel();
    await channel.assertQueue(QUEUE, { durable: true });

      console.log(`[email-consumer] listening on queue: ${QUEUE}`);

      channel.consume(
        QUEUE,
        async (msg) => {
            if (!msg) return;
            try{
                const payload = JSON.parse(msg.content.toString());
                console.log(`[email-consumer] received message: `, payload);
                // Simulate email sending
                console.log(`[email-consumer] sending email to: ${payload.to}, subject: ${payload.subject}`);
                // Acknowledge message after processing
                channel.ack(msg);
            } catch (error) {
                console.error(`[email-consumer] error processing message: `, error);
                channel.nack(msg, false, false);
            }
        },
        { noAck: false }
      );
}