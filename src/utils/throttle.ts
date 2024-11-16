const MAX_CONCURRENT_REQUESTS = 4; // Set the maximum number of concurrent requests
const requestQueue: (() => Promise<any>)[] = [];
let activeRequests = 0;

const processQueue = async () => {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const request = requestQueue.shift();
    if (request) {
      activeRequests++;
      try {
        await request();
      } catch (error) {
        console.error("Request failed:", error);
      } finally {
        activeRequests--;
        processQueue(); // Process the next request in the queue
      }
    }
  }
};

export const throttleRequest = (request: () => Promise<any>) => {
  requestQueue.push(request);
  processQueue();
};