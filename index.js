import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { startUdpServer, createResponse, createTxtAnswer } from "denamed";

const client = new Cerebras({
  apiKey: process.env["API_KEY"],
});
console.log("Cerebras AI DNS Server Started");

async function ai(question) {
  console.log("Question:", question);
  const answer = await client.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `Answer the question in concise and short manner
    Question: ${question.split(".").join("")}`,
      },
    ],
    model: "llama3.1-8b",
  });
  console.log("Answer:", answer.choices[0].message.content);
  return answer.choices[0].message.content;
}

startUdpServer(
  async (query) => {
    try {
      const question = query.questions[0].name;
      console.log(question);
      const answer = await ai(question);
      return createResponse(query, [createTxtAnswer(answer)]);
    } catch (error) {
      console.error("Error handling query:", error);
    }
  },
  {
    port: 8000,
  }
);