type UsbEndpointInfo = {
  direction: "in" | "out";
  endpointNumber: number;
  type: "bulk" | "interrupt" | "isochronous" | "control";
};

type UsbAlternateInfo = {
  alternateSetting: number;
  interfaceClass: number;
  endpoints: UsbEndpointInfo[];
};

type UsbInterfaceInfo = {
  interfaceNumber: number;
  alternates: UsbAlternateInfo[];
};

type UsbConfigurationInfo = {
  configurationValue: number;
  interfaces: UsbInterfaceInfo[];
};

type UsbTransferResult = { status: string };

type UsbDeviceInfo = {
  productName?: string;
  configuration: UsbConfigurationInfo | null;
  configurations: UsbConfigurationInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<UsbTransferResult>;
};

type WebUsbApi = {
  requestDevice(options: { acceptAllDevices: boolean }): Promise<UsbDeviceInfo>;
};

export type EscPosReceipt = {
  orderNumber: string;
  registeredBusinessName: string;
  businessAddress: string;
  tinNumber: string;
  cashier: string;
  terminal: string;
  paymentMethod: string;
  subtotal: number;
  tender: number;
  change: number;
  items: Array<{ name: string; variant?: string; quantity: number; price: number }>;
};

// A conservative 42-column width fits the printable area of most 80 mm ESC/POS rolls.
const LINE_WIDTH = 42;
const SEPARATOR = "-".repeat(LINE_WIDTH);

function printerSafeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

function wrapText(value: string, width = LINE_WIDTH) {
  const words = printerSafeText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const pieces = word.match(new RegExp(`.{1,${width}}`, "g")) ?? [word];
    for (const piece of pieces) {
      if (!line) {
        line = piece;
      } else if (`${line} ${piece}`.length <= width) {
        line = `${line} ${piece}`;
      } else {
        lines.push(line);
        line = piece;
      }
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function formatAmount(value: number) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

function totalLine(label: string, amount: number) {
  const safeLabel = printerSafeText(label);
  const safeAmount = formatAmount(amount);
  const leftWidth = Math.max(LINE_WIDTH - safeAmount.length, 1);
  return `${safeLabel.slice(0, leftWidth).padEnd(leftWidth)}${safeAmount}`;
}

function buildReceiptText(receipt: EscPosReceipt) {
  const now = new Date();
  const headerLines = [
    ...wrapText(receipt.registeredBusinessName || "APAYAO PASALUBONG CENTER"),
    ...wrapText(receipt.businessAddress || "San Isidro Sur, Luna, Apayao, Cordillera Administrative Region"),
    ...(receipt.tinNumber.trim() ? [`TIN: ${printerSafeText(receipt.tinNumber.trim())}`] : []),
  ];
  const lines = [
    SEPARATOR,
    `DATE: ${now.toLocaleDateString("en-PH")}`,
    `TIME: ${now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`,
    `ORDER: ${printerSafeText(receipt.orderNumber)}`,
    `CASHIER: ${printerSafeText(receipt.cashier || "Unknown user")}`,
    `TERMINAL: ${printerSafeText(receipt.terminal || "POS-LOCAL")}`,
    SEPARATOR,
  ];

  for (const item of receipt.items) {
    const name = `${item.name}${item.variant ? ` (${item.variant})` : ""}`;
    const amount = item.price * item.quantity;
    lines.push(...wrapText(name));
    lines.push(totalLine(`${item.quantity} x ${formatAmount(item.price)}`, amount));
  }

  lines.push(
    SEPARATOR,
    totalLine("SUBTOTAL", receipt.subtotal),
    totalLine("TOTAL", receipt.subtotal),
    `PAYMENT: ${printerSafeText(receipt.paymentMethod)}`,
    totalLine("TENDERED", receipt.tender),
    totalLine("CHANGE", receipt.change),
    SEPARATOR,
    "THANK YOU!",
    "This serves as your official receipt.",
    "\n\n\n",
  );

  return {
    headerLines: headerLines.map((line) => printerSafeText(line)),
    bodyLines: lines.map((line) => printerSafeText(line)),
  };
}

function concatenate(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function findPrinterInterface(device: UsbDeviceInfo) {
  for (const configuration of device.configurations) {
    for (const usbInterface of configuration.interfaces) {
      for (const alternate of usbInterface.alternates) {
        const outputEndpoint = alternate.endpoints.find(
          (endpoint) => endpoint.direction === "out" && endpoint.type === "bulk",
        );
        // Class 7 is the standard USB printer class. Some ESC/POS devices
        // expose a vendor-specific (0xff) interface with the same bulk output.
        if ((alternate.interfaceClass === 7 || alternate.interfaceClass === 0xff) && outputEndpoint) {
          return { configuration, usbInterface, alternate, outputEndpoint };
        }
      }
    }
  }
  return null;
}

export async function printEscPosReceipt(receipt: EscPosReceipt) {
  if (typeof window === "undefined" || !window.isSecureContext) {
    throw new Error("USB printing needs a secure page (HTTPS). Use Print Receipt for browser printing.");
  }

  const usb = (navigator as Navigator & { usb?: WebUsbApi }).usb;
  if (!usb) {
    throw new Error("This browser does not support WebUSB. Use Print Receipt for browser printing.");
  }

  let device: UsbDeviceInfo | null = null;
  let opened = false;
  let claimedInterface: number | null = null;

  try {
    // The browser requires this chooser to be opened directly by a user action.
    device = await usb.requestDevice({ acceptAllDevices: true });
    const printerInterface = findPrinterInterface(device);
    if (!printerInterface) {
      throw new Error("This device does not expose a compatible USB printer interface. Use Print Receipt instead.");
    }

    await device.open();
    opened = true;

    if (device.configuration?.configurationValue !== printerInterface.configuration.configurationValue) {
      await device.selectConfiguration(printerInterface.configuration.configurationValue);
    }

    await device.claimInterface(printerInterface.usbInterface.interfaceNumber);
    claimedInterface = printerInterface.usbInterface.interfaceNumber;
    if (printerInterface.alternate.alternateSetting !== 0) {
      await device.selectAlternateInterface(
        printerInterface.usbInterface.interfaceNumber,
        printerInterface.alternate.alternateSetting,
      );
    }

    const encoder = new TextEncoder();
    const { headerLines, bodyLines } = buildReceiptText(receipt);
    const payload = concatenate([
      Uint8Array.from([0x1b, 0x40]), // ESC @: initialize printer
      Uint8Array.from([0x1b, 0x61, 0x01]), // center alignment
      Uint8Array.from([0x1b, 0x45, 0x01]), // bold title
      encoder.encode(`${headerLines.join("\n")}\n`),
      Uint8Array.from([0x1b, 0x45, 0x00]), // normal weight
      Uint8Array.from([0x1b, 0x61, 0x00]), // left alignment
      encoder.encode(bodyLines.join("\n")),
    ]);

    const result = await device.transferOut(printerInterface.outputEndpoint.endpointNumber, payload);
    if (result.status !== "ok") {
      throw new Error("The printer did not accept the receipt data. Use Print Receipt or check the printer connection.");
    }

    return device.productName || "USB printer";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Printer selection was canceled.");
    }
    if (error instanceof Error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
      throw new Error("The browser could not access this printer's USB interface. Check the printer connection or use Print Receipt.");
    }
    throw error;
  } finally {
    if (device && claimedInterface !== null) {
      try { await device.releaseInterface(claimedInterface); } catch { /* The browser may already release it. */ }
    }
    if (device && opened) {
      try { await device.close(); } catch { /* The device may already be closed. */ }
    }
  }
}
