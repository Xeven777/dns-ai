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
    Question: ${question.split(".").join("")}?`,
      },
    ],
    model: "llama3.1-8b",
  });
  return (answer.choices as any)[0].message.content;
}

startUdpServer(
  async (query) => {
    const target = "127.0.0.1";
    if (!query.questions) {
      return createResponse(query, []);
    }

    try {
      console.log("Received query:", query);
      const question = query.questions[0].name;
      console.log("Question:", question);
      const answer = await ai(question);
      console.log("Answer:", answer);
      return createResponse(query, [createTxtAnswer(answer, target)]);
    } catch (error) {
      console.error("Error handling query:", error);
      return createResponse(query, [
        createTxtAnswer(query.questions[0], target),
      ]);
    }
  },
  {
    port: 8000,
  }
);
