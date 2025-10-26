import amqp from "amqplib";

class RabbitMQConnection {
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  async connect(url: string) {
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();
    console.log("[rabbitmq] connected");
    return { connection: this.connection, channel: this.channel };
  }

  getChannel(): amqp.Channel {
    if (!this.channel) {
      throw new Error("[rabbitmq] channel is not initialized");
    }
    return this.channel;
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    console.log("[rabbitmq] connection closed");
  }
}

export const rabbitMQ = new RabbitMQConnection();