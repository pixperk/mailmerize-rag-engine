import { rabbitMQ } from "config/rabbit";
import { startEmailConsumer } from "consumer/emailConsumer";

const RABBIT_URL = process.env.RABBIT_URL || "amqp://guest:guest@127.0.0.1:5672/%2f";

(async () => {
  try {
    await rabbitMQ.connect(RABBIT_URL);

    await startEmailConsumer();

  } catch (err) {
    console.error("failed to start service:", err);
    process.exit(1);
  }
})();