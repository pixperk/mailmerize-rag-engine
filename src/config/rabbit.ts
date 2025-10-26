import amqp from "amqplib";

let connection: amqp.ChannelModel;
let channel: amqp.Channel;

export async function connectRabbitMQ(url: string) {
  connection = await amqp.connect(url);
  channel = await connection.createChannel();
  console.log("[rabbitmq] connected");
  return { connection, channel };
}


export function getRabbitChannel() : amqp.Channel {
    if (!channel) {
        throw new Error("[rabbitmq] channel is not initialized");
    }
    return channel;
}

export async function closeRabbitMQ() {
    if (channel) {
        await channel.close();
    }
    if (connection) {
        await connection.close();
    }

    console.log("[rabbitmq] connection closed");
}