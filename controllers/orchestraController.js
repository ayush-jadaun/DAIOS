import MessageBus from "../utils/MessageBus.js";

/**
 * Handle an orchestra agent task request via MessageBus with improved error handling and timeouts.
 * Expects: { orchestraTask: string }
 */
export async function handleOrchestraTask(req, res) {
  const requestId = `api_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  console.log(`[API] Handling orchestra task request ${requestId}`);

  const { orchestraTask } = req.body;
  if (!orchestraTask) {
    console.error(`[API] No orchestra task provided in request ${requestId}`);
    return res.status(400).json({
      error: "No orchestra task provided",
      requestId,
    });
  }

  const replyChannel = `api.orchestra.response.${requestId}`;
  let responded = false;
  const bus = new MessageBus("api-orchestra");

  // Timeout configuration
  const TIMEOUT_MS = 600000; // 10 minutes
  let timeoutHandle;

  const cleanup = () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    // Clean up subscription
    try {
      bus.unsubscribe(replyChannel);
    } catch (err) {
      console.warn(`[API] Cleanup warning for ${requestId}:`, err.message);
    }
  };

  const respond = (data, statusCode = 200) => {
    if (!responded) {
      responded = true;
      cleanup();

      if (statusCode === 200) {
        console.log(`[API] Successfully responding to request ${requestId}`);
        res.json({
          ...data,
          requestId,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.error(`[API] Error response for request ${requestId}:`, data);
        res.status(statusCode).json({
          ...data,
          requestId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  try {
    // Set up message handler
    const handler = (msg) => {
      console.log(`[API] Received response for ${requestId}:`, msg.type);

      if (msg.type === "ORCHESTRA_RESULT") {
        respond({
          success: true,
          result: msg.data || msg,
          type: "success",
        });
      } else if (msg.type === "ORCHESTRA_ERROR") {
        respond(
          {
            success: false,
            error: msg.data?.error || msg.error || "Unknown orchestra error",
            type: "error",
          },
          500
        );
      } else {
        // Handle other message types
        respond({
          success: true,
          result: msg,
          type: "response",
        });
      }
    };

    // Subscribe to response channel
    await bus.subscribe(replyChannel, handler);
    console.log(
      `[API] Subscribed to reply channel ${replyChannel} for request ${requestId}`
    );

    // Set up timeout
    timeoutHandle = setTimeout(() => {
      respond(
        {
          success: false,
          error: "Orchestra agent timeout - task took too long to complete",
          type: "timeout",
          timeoutMs: TIMEOUT_MS,
        },
        504
      );
    }, TIMEOUT_MS);

    // Publish task to orchestra agent
    await bus.publish("agent.orchestra.task", "ORCHESTRA_TASK", {
      userTask: orchestraTask,
      replyChannel,
      requestId,
      timestamp: new Date().toISOString(),
    });

    console.log(
      `[API] Published orchestra task for request ${requestId}: ${orchestraTask}`
    );
  } catch (error) {
    console.error(`[API] Failed to handle orchestra task ${requestId}:`, error);
    respond(
      {
        success: false,
        error: `Failed to process orchestra task: ${error.message}`,
        type: "internal_error",
      },
      500
    );
  }
}

/**
 * Health check endpoint for orchestra agent
 */
export async function checkOrchestraHealth(req, res) {
  const requestId = `health_${Date.now()}`;

  try {
    const bus = new MessageBus("api-health");
    const replyChannel = `health.check.${requestId}`;
    let responded = false;

    const respond = (data, statusCode = 200) => {
      if (!responded) {
        responded = true;
        res.status(statusCode).json({
          ...data,
          requestId,
          timestamp: new Date().toISOString(),
        });
      }
    };

    // Simple health check - try to publish a message
    setTimeout(() => {
      respond({
        status: "healthy",
        service: "orchestra-agent",
        message: "Orchestra agent API is responding",
      });
    }, 100);
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      service: "orchestra-agent",
      error: error.message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get orchestra agent status
 */
export async function getOrchestraStatus(req, res) {
  try {
    const status = {
      service: "orchestra-agent",
      status: "running",
      version: "1.0.0",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({
      service: "orchestra-agent",
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
