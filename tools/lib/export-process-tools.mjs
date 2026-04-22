import { execFileSync } from "node:child_process";
import path from "node:path";

const DEFAULT_EXPORT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_BENCHMARK_COMPILE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_BENCHMARK_RUN_TIMEOUT_MS = 2 * 60 * 1000;

function parseTimeoutMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function resolveTimeoutMs(timeoutMs, timeoutEnvVar) {
  if (typeof timeoutEnvVar === "string") {
    const envTimeoutMs = parseTimeoutMs(process.env[timeoutEnvVar]);
    if (envTimeoutMs != null) {
      return envTimeoutMs;
    }
  }

  return parseTimeoutMs(timeoutMs) ?? DEFAULT_EXPORT_TIMEOUT_MS;
}

function formatCommand(command, args) {
  return [command, ...args].map((token) => JSON.stringify(String(token))).join(" ");
}

function isTimeoutError(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      ("code" in error || "errno" in error) &&
      (error.code === "ETIMEDOUT" || error.errno === "ETIMEDOUT")
  );
}

function runCommand(command, args, options = {}) {
  const {
    description = command,
    killSignal = "SIGKILL",
    timeoutEnvVar = "FWAK_EXPORT_TIMEOUT_MS",
    timeoutMs = DEFAULT_EXPORT_TIMEOUT_MS,
    ...execOptions
  } = options;
  const resolvedTimeoutMs = resolveTimeoutMs(timeoutMs, timeoutEnvVar);

  try {
    return execFileSync(command, args, {
      ...execOptions,
      killSignal,
      timeout: resolvedTimeoutMs
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new Error(
        `${description} timed out after ${resolvedTimeoutMs}ms while running ${formatCommand(command, args)}.`,
        { cause: error }
      );
    }
    throw error;
  }
}

function runNodeTool(root, scriptRelativePath, args = [], options = {}) {
  return runCommand(process.execPath, [path.join(root, scriptRelativePath), ...args], {
    description: options.description ?? scriptRelativePath,
    ...options
  });
}

function stripFlagWithValue(argv, flag) {
  const forwardedArgs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== flag) {
      forwardedArgs.push(token);
      continue;
    }

    const nextValue = argv[index + 1];
    if (nextValue && !String(nextValue).startsWith("--")) {
      index += 1;
    }
  }

  return forwardedArgs;
}

export {
  DEFAULT_BENCHMARK_COMPILE_TIMEOUT_MS,
  DEFAULT_BENCHMARK_RUN_TIMEOUT_MS,
  DEFAULT_EXPORT_TIMEOUT_MS,
  resolveTimeoutMs,
  runCommand,
  runNodeTool,
  stripFlagWithValue
};
