import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { startUdpServer, createResponse, createTxtAnswer } from "denamed";

const client = new Cerebras({
  apiKey: process.env["API_KEY"],
});
console.log("AI DNS Server Started");

async function ai(question: string) {
  const answer = await client.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `Answer the question in concise and short manner
    Question: ${question.split(".").join(" ")}?`,
      },
    ],
    model: "llama3.1-8b",
  });
  return (answer.choices as any)[0].message.content;
}

startUdpServer(
  async (query) => {
    if (!query.questions) {
      return createResponse(query, []);
    }
    const question = query.questions[0].name;

    try {
      const answer = await ai(question);
      console.log({ question, answer });

      return createResponse(query, [
        createTxtAnswer(
          {
            name: question,
            type: "TXT",
          },
          answer
        ),
      ]);
    } catch (error) {
      console.error("Error handling query:", error);
      return createResponse(query, [
        createTxtAnswer(
          {
            name: question,
            type: "TXT",
          },
          "OOps! Something went wrong"
        ),
      ]);
    }
  },
  {
    port: 8000,
    address: "127.0.0.1",
  }
);
