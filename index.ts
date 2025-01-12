import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { startUdpServer, createResponse, createTxtAnswer } from "denamed";
import * as json from "json5";

type ChatCompletionResponse = {
  id: string;
  choices: {
    finish_reason: string;
    index: number;
    message: {
      content: string;
      role: string;
      tool_calls?: {
        function: {
          name: string;
          arguments: string;
        };
        id: string;
      }[];
    };
  }[];
  created: number;
  model: string;
  system_fingerprint: string;
  object: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  time_info: {
    queue_time: number;
    prompt_time: number;
    completion_time: number;
    total_time: number;
    created: number;
  };
};

const client = new Cerebras({
  apiKey: process.env["API_KEY"],
});
console.log("AI DNS Server Started");

const tools = [
  {
    type: "function",
    function: {
      name: "calculate",
      description:
        "A calculator tool that can perform basic arithmetic operations. Use this when you need to compute mathematical expressions or solve numerical problems.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "The mathematical expression to evaluate",
          },
        },
        required: ["expression"],
      },
    },
  },
];

function calculate(expression: string) {
  // Remove any characters that are not digits, operators, or parentheses
  expression = expression.replace(/[^0-9+\-*/().]/g, "");

  try {
    const result = eval(expression);
    return String(result);
  } catch (error) {
    return "Error: Invalid expression";
  }
}

async function ai(question: string) {
  let messages: any = [
    {
      role: "system",
      content:
        "You are a helpful assistant who can answer anything also with access to a calculator. Use the calculator tool to compute mathematical expressions only when needed.",
    },
    {
      role: "user",
      content: `Answer the question in concise and short manner
    Question: ${question.split(".").join(" ")}?`,
    },
  ];

  // @ts-expect-error
  let response: ChatCompletionResponse = await client.chat.completions.create({
    messages: messages,
    tools,
    model: "llama3.1-8b",
  });

  let choice = response.choices[0].message;

  if (choice.tool_calls) {
    const function_call = choice.tool_calls[0].function;
    if (function_call.name == "calculate") {
      // Logging that the model is executing a function named "calculate".
      console.log(
        `Model executing function '${function_call.name}' with arguments ${function_call.arguments}`
      );

      // Parse the arguments from JSON format and perform the requested calculation.
      const parsedArgs = json.parse(function_call.arguments);
      const result = calculate(parsedArgs.expression);

      // Note: This is the result of executing the model's request (the tool call), not the model's own output.
      console.log(`Calculation result sent to model: ${result}`);

      // Send the result back to the model to fulfill the request.
      messages.push({
        role: "tool",
        content: json.stringify(result),
        tool_call_id: choice.tool_calls[0].id,
      });

      // Request the final response from the model, now that it has the calculation result.
      // @ts-expect-error
      response = await client.chat.completions.create({
        model: "llama3.1-8b",
        messages,
      });

      if (response) {
        return response.choices[0].message.content;
      } else {
        console.log("No final response received");
        return "Error: No final response received";
      }
    }
  } else {
    return response.choices[0].message.content;
  }
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
          answer || "OOps! Something went wrong"
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
