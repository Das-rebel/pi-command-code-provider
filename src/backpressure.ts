/**
 * Simple backpressure / flow control for streaming responses.
 *
 * Tracks buffered bytes and yields control back to the event loop when
 * the buffered amount exceeds a high-water mark. Prevents memory pressure
 * when the upstream produces data faster than the consumer processes it.
 */

export class BackpressureController {
  private bufferedBytes = 0;
  private readonly highWaterMark: number;
  private readonly yieldSize: number;

  /**
   * @param highWaterMark  Byte threshold above which we yield (default: 1MB)
   * @param yieldSize      Number of yields to issue when above HWM (default: 1)
   */
  constructor(highWaterMark = 1024 * 1024, yieldSize = 1) {
    this.highWaterMark = highWaterMark;
    this.yieldSize = yieldSize;
  }

  /**
   * Record that `byteLength` bytes have been buffered.
   * If the total exceeds the high-water mark, yields to the event loop
   * to allow the consumer to catch up.
   */
  async record(byteLength: number): Promise<void> {
    this.bufferedBytes += byteLength;
    if (this.bufferedBytes >= this.highWaterMark) {
      for (let i = 0; i < this.yieldSize; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }
  }

  /**
   * Record that `byteLength` bytes have been consumed from the buffer.
   */
  consume(byteLength: number): void {
    this.bufferedBytes = Math.max(0, this.bufferedBytes - byteLength);
  }

  /** Get current buffered byte count. */
  getBufferedBytes(): number {
    return this.bufferedBytes;
  }

  /** Reset the buffered byte counter. */
  reset(): void {
    this.bufferedBytes = 0;
  }
}
