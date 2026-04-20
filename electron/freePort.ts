import net from "node:net";

const LOCALHOST_ADDRESS = "127.0.0.1";

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Failed to resolve an ephemeral localhost port"));
        });
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
    server.listen(0, LOCALHOST_ADDRESS);
  });
}
