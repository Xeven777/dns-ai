import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { startUdpServer, createResponse, createTxtAnswer } from "denamed";
import * as json from "json5";
import axios from "axios";
import * as os from "os";

const WEATHER_API_KEY = process.env["WEATHER_API"];
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
        "A calculator tool that can perform basic arithmetic operations.",
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
  {
    type: "function",
    function: {
      name: "getTime",
      description: "Get current time in a your timezone",
    },
  },
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name or location",
          },
        },
        required: ["location"],
      },
    },
  },
];
function getTime() {
  return new Date().toLocaleTimeString("en", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

async function getWeather(location: string): Promise<string> {
  try {
    const response = await axios.get(
      `http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(
        location
      )}`
    );
    const data = response.data;
    return `${data.current.temp_c}°C, ${data.current.condition.text} in ${data.location.name}, ${data.location.country}`;
  } catch (error) {
    return "Error Could not fetch weather data";
  }
}
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
        "You are a helpful assistant who can answer anything in short and with access to various tools including a calculator, time lookup, and weather information. Only Use these tools when relevant to answer questions.",
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
    let result;

    switch (function_call.name) {
      case "calculate":
        const calcArgs = json.parse(function_call.arguments);
        result = calculate(calcArgs.expression);
        break;
      case "getTime":
        result = getTime();
        break;
      case "getWeather":
        const weatherArgs = json.parse(function_call.arguments);
        result = await getWeather(weatherArgs.location);
        break;
    }

    console.log(`Tool '${function_call.name}' result: ${result}`);

    messages.push({
      role: "tool",
      content: json.stringify(result),
      tool_call_id: choice.tool_calls[0].id,
    });

    // @ts-expect-error
    response = await client.chat.completions.create({
      model: "llama-3.3-70b",
      messages,
    });

    if (response) {
      return response.choices[0].message.content;
    } else {
      return "Error: No final response received";
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
          answer.replace("°", " degree ") || "OOps! Something went wrong"
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
