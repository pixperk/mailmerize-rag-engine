import { connectRabbitMQ } from "config/rabbit";
import { startEmailConsumer } from "consumer/emailConsumer";

const RABBIT_URL = process.env.RABBIT_URL || "amqp://guest:guest@127.0.0.1:5672/%2f";

(async () => {
  try {
    const { channel } = await connectRabbitMQ(RABBIT_URL);
    console.log("channel : ", channel);
    
    await startEmailConsumer();

  } catch (err) {
    console.error("failed to start service:", err);
    process.exit(1);
  }
})();