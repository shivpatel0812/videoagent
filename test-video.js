const VideoAnalysisAgent = require('./ai-agent/src/agent');
const path = require('path');

async function testAgent() {
  try {
    const agent = new VideoAnalysisAgent({
      outputDir: './test-output'
    });

    await agent.initialize();
    console.log('Agent initialized successfully!');

    const result = await agent.invokeAgent(
      "Tell me what tools you have available for video analysis",
      {}
    );

    console.log('Agent response:', result.output);
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testAgent();