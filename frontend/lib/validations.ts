import { z } from "zod";

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const allowedExtensions = ["log", "txt"];

export const uploadFormSchema = z.object({
  file: z
    .instanceof(File, { message: "Select a .log or .txt file to analyze." })
    .refine((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      return Boolean(extension && allowedExtensions.includes(extension));
    }, "Only .log and .txt files are supported.")
    .refine((file) => file.size <= MAX_UPLOAD_SIZE_BYTES, "File must be 10 MB or smaller."),
});

export type UploadFormValues = z.infer<typeof uploadFormSchema>;