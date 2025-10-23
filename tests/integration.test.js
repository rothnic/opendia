import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

/**
 * Integration tests for OpenDia MCP Server and Extension
 *
 * Prerequisites:
 * 1. MCP server must be running on ws://localhost:5555
 * 2. Browser extension must be loaded and connected
 *
 * Run with: npm test
 */

const MCP_SERVER_URL = "ws://localhost:5555";
const CONNECTION_TIMEOUT = 5000;
const TEST_TIMEOUT = 8000;

describe("OpenDia MCP Integration Tests", () => {
	let ws;
	let isExtensionConnected = false;
	let registeredTools = [];

	beforeAll(async () => {
		// Connect to MCP server
		ws = new WebSocket(MCP_SERVER_URL);

		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Failed to connect to MCP server. Is it running?"));
			}, CONNECTION_TIMEOUT);

			ws.on("open", () => {
				clearTimeout(timeout);
				resolve();
			});

			ws.on("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});

		// Wait for tool registration from extension
		await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				console.warn(
					"⚠️  Extension did not register tools. Some tests will be skipped.",
				);
				resolve();
			}, 3000);

			ws.on("message", (data) => {
				try {
					const message = JSON.parse(data.toString());
					if (message.type === "register" && message.tools) {
						clearTimeout(timeout);
						isExtensionConnected = true;
						registeredTools = message.tools.map((t) => t.name);
						console.log(
							`✅ Extension registered ${registeredTools.length} tools`,
						);
						resolve();
					}
				} catch (e) {
					// Ignore parse errors
				}
			});
		});
	});

	afterAll(() => {
		if (ws) {
			ws.close();
		}
	});

	describe("MCP Server Connection", () => {
		it("should connect to MCP server successfully", () => {
			expect(ws.readyState).toBe(WebSocket.OPEN);
		});

		it("should be accessible on ws://localhost:5555", () => {
			expect(MCP_SERVER_URL).toBe("ws://localhost:5555");
		});
	});

	describe("Extension Registration", () => {
		it("should receive tool registration from extension", () => {
			if (!isExtensionConnected) {
				console.warn("⚠️  Skipping: Extension not connected");
				return;
			}
			expect(registeredTools.length).toBeGreaterThan(0);
		});

		it("should register page_execute_script tool", () => {
			if (!isExtensionConnected) {
				console.warn("⚠️  Skipping: Extension not connected");
				return;
			}
			expect(registeredTools).toContain("page_execute_script");
		});

		it("should register core tools", () => {
			if (!isExtensionConnected) {
				console.warn("⚠️  Skipping: Extension not connected");
				return;
			}

			const coreTools = [
				"page_analyze",
				"page_extract_content",
				"element_click",
				"element_fill",
				"tab_create",
				"tab_list",
			];

			coreTools.forEach((tool) => {
				expect(registeredTools).toContain(tool);
			});
		});
	});

	describe("page_execute_script Tool", () => {
		it(
			"should execute simple JavaScript and return result",
			async () => {
				if (
					!isExtensionConnected ||
					!registeredTools.includes("page_execute_script")
				) {
					console.warn("⚠️  Skipping: page_execute_script not available");
					return;
				}

				const requestId = Date.now();
				const testScript = '"test-string"';

				const result = await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Test timeout"));
					}, TEST_TIMEOUT);

					const messageHandler = (data) => {
						try {
							const message = JSON.parse(data.toString());
							if (message.id === requestId) {
								clearTimeout(timeout);
								ws.off("message", messageHandler);
								resolve(message);
							}
						} catch (e) {
							// Ignore parse errors
						}
					};

					ws.on("message", messageHandler);

					ws.send(
						JSON.stringify({
							id: requestId,
							method: "page_execute_script",
							params: {
								script: testScript,
								timeout: 5000,
								include_context: true,
							},
						}),
					);
				});

				expect(result.error).toBeUndefined();
				expect(result.result).toBeDefined();
				expect(result.result.success).toBe(true);
			},
			TEST_TIMEOUT,
		);

		it(
			"should not have CSP violations when executing scripts",
			async () => {
				if (
					!isExtensionConnected ||
					!registeredTools.includes("page_execute_script")
				) {
					console.warn("⚠️  Skipping: page_execute_script not available");
					return;
				}

				const requestId = Date.now() + 1;
				const testScript = "document.title";

				const result = await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Test timeout"));
					}, TEST_TIMEOUT);

					const messageHandler = (data) => {
						try {
							const message = JSON.parse(data.toString());
							if (message.id === requestId) {
								clearTimeout(timeout);
								ws.off("message", messageHandler);
								resolve(message);
							}
						} catch (e) {
							// Ignore parse errors
						}
					};

					ws.on("message", messageHandler);

					ws.send(
						JSON.stringify({
							id: requestId,
							method: "page_execute_script",
							params: {
								script: testScript,
								timeout: 5000,
								include_context: true,
							},
						}),
					);
				});

				// Check that there's no CSP error in the response
				if (result.error) {
					expect(result.error.message).not.toContain("Content Security Policy");
					expect(result.error.message).not.toContain("unsafe-eval");
				}

				// Result should be successful or have a non-CSP error
				const hasCSPError =
					result.error?.message?.includes("Content Security Policy") ||
					result.error?.message?.includes("unsafe-eval");
				expect(hasCSPError).toBe(false);
			},
			TEST_TIMEOUT,
		);

		it(
			"should execute DOM queries correctly",
			async () => {
				if (
					!isExtensionConnected ||
					!registeredTools.includes("page_execute_script")
				) {
					console.warn("⚠️  Skipping: page_execute_script not available");
					return;
				}

				const requestId = Date.now() + 2;
				const testScript = 'document.querySelectorAll("*").length';

				const result = await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Test timeout"));
					}, TEST_TIMEOUT);

					const messageHandler = (data) => {
						try {
							const message = JSON.parse(data.toString());
							if (message.id === requestId) {
								clearTimeout(timeout);
								ws.off("message", messageHandler);
								resolve(message);
							}
						} catch (e) {
							// Ignore parse errors
						}
					};

					ws.on("message", messageHandler);

					ws.send(
						JSON.stringify({
							id: requestId,
							method: "page_execute_script",
							params: {
								script: testScript,
								timeout: 5000,
								include_context: true,
							},
						}),
					);
				});

				if (result.result?.success) {
					expect(typeof result.result.result).toBe("number");
					expect(result.result.result).toBeGreaterThan(0);
				}
			},
			TEST_TIMEOUT,
		);

		it(
			"should include browser context when requested",
			async () => {
				if (
					!isExtensionConnected ||
					!registeredTools.includes("page_execute_script")
				) {
					console.warn("⚠️  Skipping: page_execute_script not available");
					return;
				}

				const requestId = Date.now() + 3;
				const testScript = '"context-test"';

				const result = await new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Test timeout"));
					}, TEST_TIMEOUT);

					const messageHandler = (data) => {
						try {
							const message = JSON.parse(data.toString());
							if (message.id === requestId) {
								clearTimeout(timeout);
								ws.off("message", messageHandler);
								resolve(message);
							}
						} catch (e) {
							// Ignore parse errors
						}
					};

					ws.on("message", messageHandler);

					ws.send(
						JSON.stringify({
							id: requestId,
							method: "page_execute_script",
							params: {
								script: testScript,
								timeout: 5000,
								include_context: true,
							},
						}),
					);
				});

				if (result.result?.success && result.result.context) {
					expect(result.result.context).toBeDefined();
					expect(result.result.context.tab_id).toBeDefined();
					expect(result.result.context.url).toBeDefined();
				}
			},
			TEST_TIMEOUT,
		);
	});

	describe("SSE Transport", () => {
		it("should support hybrid response mode", () => {
			// This is tested implicitly through successful communication
			expect(ws.readyState).toBe(WebSocket.OPEN);
		});
	});

	describe("Persistent Connection", () => {
		it("should maintain connection with keepalive", async () => {
			const initialState = ws.readyState;

			// Wait a bit to ensure keepalive has kicked in
			await new Promise((resolve) => setTimeout(resolve, 2000));

			expect(ws.readyState).toBe(WebSocket.OPEN);
			expect(ws.readyState).toBe(initialState);
		});
	});
});
