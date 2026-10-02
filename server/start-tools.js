import { createToolService } from "./tool-service.js";
createToolService(process.env.TOOL_SHARED_SECRET).listen(
  3001,
  "127.0.0.1",
  () =>
    console.log(
      "Example order tool: http://localhost:3001/tools/lookup-order (sample data only)",
    ),
);
