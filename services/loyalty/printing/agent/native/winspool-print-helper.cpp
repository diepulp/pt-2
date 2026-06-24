// winspool-print-helper.cpp — RAW ESC/POS winspool helper (PRD-093 WS_W2, DEC-WIN-01)
//
// Contract (the TS facade in ../windows-spooler-native.ts depends on this exactly):
//   - argv:   --queue "<printer/queue name>"   (required)
//   - stdin:  the COMPLETE RAW ESC/POS byte payload, read to EOF (binary)
//   - stdout: EXACTLY ONE newline-terminated JSON object:
//               {"outcome":"accepted","jobId":"<spooler job id>"}
//               {"outcome":"rejected","reason":"<sanitized class string>"}
//   - stderr: agent-local diagnostics ONLY (Win32 GetLastError, queue name).
//             These NEVER appear on stdout and NEVER enter the canonical contract (INV-4).
//   - exit:   0 on accepted, non-zero on rejected.
//
// Win32 RAW sequence (FR-2):
//   OpenPrinter -> StartDocPrinter(pDatatype="RAW") -> StartPagePrinter
//     -> WritePrinter (loop until the COMPLETE buffer is written)
//     -> EndPagePrinter -> EndDocPrinter -> ClosePrinter
// Partial / failed write => abort, guaranteed cleanup, "rejected"/"partial_write".
// This is delivered code, not a certification-time stub. Build: see README.md.

#include <windows.h>
#include <winspool.h>
#include <io.h>
#include <fcntl.h>
#include <cstdio>
#include <string>
#include <vector>

namespace {

// Emit the single stdout JSON result line. `reason` omitted when empty.
void EmitResult(const char* outcome, const std::string& jobId,
                const std::string& reason) {
  std::fputs("{\"outcome\":\"", stdout);
  std::fputs(outcome, stdout);
  std::fputc('"', stdout);
  if (!jobId.empty()) {
    std::fprintf(stdout, ",\"jobId\":\"%s\"", jobId.c_str());
  }
  if (!reason.empty()) {
    std::fprintf(stdout, ",\"reason\":\"%s\"", reason.c_str());
  }
  std::fputs("}\n", stdout);
  std::fflush(stdout);
}

// Agent-local diagnostic to stderr (never stdout, never the canonical contract).
void LogWin32(const char* where, DWORD err) {
  std::fprintf(stderr, "winspool-print-helper: %s failed (Win32 %lu)\n", where,
               static_cast<unsigned long>(err));
}

}  // namespace

int main(int argc, char** argv) {
  std::string queue;
  for (int i = 1; i < argc; ++i) {
    if (std::string(argv[i]) == "--queue" && i + 1 < argc) {
      queue = argv[++i];
    }
  }
  if (queue.empty()) {
    std::fputs("winspool-print-helper: missing --queue\n", stderr);
    EmitResult("rejected", "", "missing_queue");
    return 2;
  }

  // Read the RAW payload from stdin in BINARY mode (no CRLF translation).
  _setmode(_fileno(stdin), _O_BINARY);
  std::vector<unsigned char> payload;
  unsigned char buf[8192];
  size_t n;
  while ((n = std::fread(buf, 1, sizeof(buf), stdin)) > 0) {
    payload.insert(payload.end(), buf, buf + n);
  }
  if (payload.empty()) {
    EmitResult("rejected", "", "empty_payload");
    return 2;
  }

  HANDLE hPrinter = nullptr;
  std::string mutableQueue = queue;  // OpenPrinterA wants a non-const buffer.
  if (!OpenPrinterA(&mutableQueue[0], &hPrinter, nullptr)) {
    LogWin32("OpenPrinter", GetLastError());
    EmitResult("rejected", "", "open_failed");
    return 3;
  }

  DOC_INFO_1A docInfo;
  ZeroMemory(&docInfo, sizeof(docInfo));
  char docName[] = "PT-2 Loyalty Receipt";
  char dataType[] = "RAW";  // FR-2: byte-transparent RAW datatype.
  docInfo.pDocName = docName;
  docInfo.pOutputFile = nullptr;
  docInfo.pDatatype = dataType;

  DWORD jobId = StartDocPrinterA(hPrinter, 1,
                                 reinterpret_cast<LPBYTE>(&docInfo));
  if (jobId == 0) {
    LogWin32("StartDocPrinter", GetLastError());
    ClosePrinter(hPrinter);
    EmitResult("rejected", "", "start_doc_failed");
    return 4;
  }

  if (!StartPagePrinter(hPrinter)) {
    LogWin32("StartPagePrinter", GetLastError());
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    EmitResult("rejected", "", "start_page_failed");
    return 5;
  }

  // WritePrinter loop: write the COMPLETE buffer; a short/failed write aborts.
  const DWORD total = static_cast<DWORD>(payload.size());
  DWORD written = 0;
  bool ok = true;
  while (written < total) {
    DWORD chunk = 0;
    if (!WritePrinter(hPrinter, payload.data() + written, total - written,
                      &chunk) ||
        chunk == 0) {
      LogWin32("WritePrinter", GetLastError());
      ok = false;
      break;
    }
    written += chunk;
  }

  // Guaranteed cleanup regardless of the write outcome.
  EndPagePrinter(hPrinter);
  EndDocPrinter(hPrinter);
  ClosePrinter(hPrinter);

  if (!ok || written != total) {
    EmitResult("rejected", "", "partial_write");
    return 6;
  }

  char jobIdStr[32];
  std::snprintf(jobIdStr, sizeof(jobIdStr), "%lu",
                static_cast<unsigned long>(jobId));
  EmitResult("accepted", jobIdStr, "");
  return 0;
}
