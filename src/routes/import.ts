import { Router, type Request, type Response } from "express";
import multer from "multer";
import { detectBroker, parseCSV } from "../parsers/autoDetect.js";
import type { ImportResponse } from "../types/trade.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.post("/import", upload.single("file"), (req: Request, res: Response) => {
  const startTime = Date.now();

  if (!req.file) {
    res.status(400).json({
      error: "No file uploaded. Please provide a CSV file in the 'file' field.",
    });
    return;
  }

  const csvText = req.file.buffer.toString("utf-8");

  if (csvText.trim() === "") {
    res.status(400).json({
      error: "CSV file is empty",
    });
    return;
  }

  const detection = detectBroker(csvText);
  if (!detection.broker || detection.error) {
    res.status(400).json({
      error: detection.error ?? "Unable to detect broker format",
    });
    return;
  }

  try {
    const { broker, result } = parseCSV(csvText);
    const total = result.trades.length + result.errors.length;

    const response: ImportResponse = {
      broker,
      summary: {
        total,
        valid: result.trades.length,
        skipped: result.errors.length,
      },
      trades: result.trades,
      errors: result.errors,
      timestamp: new Date().toISOString(),
      filename: req.file.originalname,
      processingTimeMs: Date.now() - startTime,
    };

    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during parsing";
    res.status(500).json({ error: message });
  }
});

export default router;
