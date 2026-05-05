/**
 * Invoice Generator Module
 * Generates A5-sized PDF invoices from profile data with professional formatting
 */

export class InvoiceGenerator {
  constructor() {
    this.invoiceData = {
      invoiceNumber: "",
      invoiceDate: new Date().toLocaleDateString("en-GB", {
        dateStyle: "medium",
      }),
      dueDate: this.getDateAfterDays(30),
      logo: null, // Base64 or URL
      from: {
        name: "InstaRishta",
        address: "Hyderabad, India",
        email: "contact@instarishta.com",
        phone: "+91 XXXXX XXXXX",
      },
      billTo: {
        name: "",
        address: "",
        email: "",
        phone: "",
      },
      items: [
        {
          id: this.generateUUID(),
          description: "Profile Listing (30 days)",
          quantity: 1,
          unitPrice: 0,
          gstPercent: 18,
        },
      ],
      termsAndConditions:
        "**Payment Terms**\n1. Payment due within 30 days\n2. Late fees apply after due date",
      personName: "",
      personNumber: "",
    };
  }

  /**
   * Initialize invoice generator with profile data
   */
  initWithProfile(profile) {
    this.invoiceData.billTo = {
      name: profile.title || profile.guardianName || "Profile User",
      address: profile.location || "Not provided",
      email: profile.email || "not provided",
      phone: profile.whatsapp || profile.phone || "Not provided",
    };

    // Generate invoice number based on profile ID
    const invoiceNum = String(profile.id).padStart(6, "0");
    this.invoiceData.invoiceNumber = `#INV-${invoiceNum}-${new Date().getFullYear()}`;

    return this;
  }

  /**
   * Set invoice items from form data
   */
  setItems(items) {
    this.invoiceData.items = items.map((item) => ({
      ...item,
      id: item.id || this.generateUUID(),
    }));
    return this;
  }

  /**
   * Calculate item totals with GST
   */
  calculateItemTotal(quantity, unitPrice, gstPercent) {
    const subtotal = quantity * unitPrice;
    const gstAmount = (subtotal * gstPercent) / 100;
    return {
      subtotal,
      gst: gstAmount,
      total: subtotal + gstAmount,
    };
  }

  /**
   * Calculate invoice totals
   */
  getInvoiceTotals() {
    let subtotal = 0;
    let totalGst = 0;

    this.invoiceData.items.forEach((item) => {
      const itemTotal = this.calculateItemTotal(
        item.quantity,
        item.unitPrice,
        item.gstPercent,
      );
      subtotal += itemTotal.subtotal;
      totalGst += itemTotal.gst;
    });

    return {
      subtotal,
      gst: totalGst,
      total: subtotal + totalGst,
    };
  }

  /**
   * Format currency for INR
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Generate unique ID for items
   */
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }

  /**
   * Get date after N days
   */
  getDateAfterDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString("en-GB", { dateStyle: "medium" });
  }

  /**
   * Parse markdown-style text to HTML with numbered bullets and bold titles
   */
  parseTermsAndConditions(text) {
    if (!text || !text.trim()) return "";

    const lines = text.split("\n");
    let html = '<div class="invoice-terms-container">';
    let isInList = false;
    let listNumber = 1;

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed) return;

      // Check for bold title (marked with **)
      if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
        if (isInList) {
          html += "</ol>";
          isInList = false;
          listNumber = 1;
        }
        const title = trimmed.replace(/\*\*/g, "");
        html += `<div class="invoice-terms-title">${this.escapeHtml(title)}</div>`;
      }
      // Check for numbered list items (marked with 1., 2., etc.)
      else if (/^\d+\.\s/.test(trimmed)) {
        if (!isInList) {
          html += '<ol class="invoice-terms-list">';
          isInList = true;
          listNumber = 1;
        }
        const content = trimmed.replace(/^\d+\.\s/, "");
        html += `<li>${this.escapeHtml(content)}</li>`;
      }
      // Regular text line
      else {
        if (isInList) {
          html += "</ol>";
          isInList = false;
          listNumber = 1;
        }
        if (trimmed) {
          html += `<p class="invoice-terms-text">${this.escapeHtml(trimmed)}</p>`;
        }
      }
    });

    if (isInList) {
      html += "</ol>";
    }

    html += "</div>";
    return html;
  }

  /**
   * Generate invoice HTML (A5 format - 148 x 210 mm)
   */
  generateInvoiceHTML() {
    const totals = this.getInvoiceTotals();
    const itemsHTML = this.invoiceData.items
      .map((item) => {
        const itemTotal = this.calculateItemTotal(
          item.quantity,
          item.unitPrice,
          item.gstPercent,
        );
        return `
        <tr>
          <td class="invoice-table-cell invoice-desc">${this.escapeHtml(item.description)}</td>
          <td class="invoice-table-cell invoice-qty">${item.quantity}</td>
          <td class="invoice-table-cell invoice-price text-right">${this.formatCurrency(item.unitPrice)}</td>
          <td class="invoice-table-cell invoice-gst text-right">${item.gstPercent}%</td>
          <td class="invoice-table-cell invoice-total text-right">${this.formatCurrency(itemTotal.total)}</td>
        </tr>
      `;
      })
      .join("");

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice ${this.invoiceData.invoiceNumber}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            line-height: 1.4;
          }

          @page {
            size: A5;
            margin: 4mm;
          }

          .invoice-container {
            width: 100%;
            max-width: 148mm;
            background: white;
            padding: 6mm;
            page-break-after: avoid;
          }

          .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 6px;
            border-bottom: 2px solid #1f2937;
            padding-bottom: 4px;
          }

          .invoice-brand {
            flex: 1;
          }

          .invoice-title {
            font-size: 18px;
            font-weight: 700;
            color: #1f2937;
            letter-spacing: 0.05em;
            margin-bottom: 1px;
          }

          .invoice-brand-detail {
            font-size: 9px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .invoice-number {
            text-align: right;
            font-size: 11px;
          }

          .invoice-number-label {
            display: block;
            color: #6b7280;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 2px;
          }

          .invoice-number-value {
            display: block;
            color: #1f2937;
            font-weight: 700;
            font-size: 12px;
          }

          .invoice-dates {
            display: flex;
            gap: 8px;
            margin-bottom: 6px;
            font-size: 10px;
          }

          .invoice-date-item {
            flex: 1;
            padding: 4px;
            background: #f3f4f6;
            border-radius: 4px;
          }

          .invoice-date-label {
            display: block;
            color: #6b7280;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            margin-bottom: 1px;
            font-size: 8px;
          }

          .invoice-date-value {
            display: block;
            color: #1f2937;
            font-weight: 600;
            font-size: 9px;
          }

          .invoice-parties {
            display: flex;
            gap: 8px;
            margin-bottom: 6px;
            font-size: 9px;
          }

          .invoice-party {
            flex: 1;
            padding: 6px;
            background: #f9fafb;
            border-left: 3px solid #3b82f6;
            border-radius: 2px;
          }

          .invoice-party-label {
            display: block;
            color: #6b7280;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 2px;
            font-size: 8px;
          }

          .invoice-party-name {
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 1px;
            font-size: 9px;
          }

          .invoice-party-detail {
            color: #4b5563;
            line-height: 1.2;
            margin-bottom: 1px;
            font-size: 8px;
          }

          .invoice-items {
            width: 100%;
            margin-bottom: 6px;
            font-size: 9px;
            border-collapse: collapse;
          }

          .invoice-items-header {
            background: #1f2937;
            color: white;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }

          .invoice-items-header th {
            padding: 4px 3px;
            text-align: left;
            font-size: 8px;
            border: 1px solid #374151;
          }

          .invoice-table-cell {
            padding: 3px 3px;
            border-bottom: 1px solid #e5e7eb;
          }

          .invoice-table-cell.invoice-desc {
            flex: 2;
          }

          .invoice-table-cell.text-right {
            text-align: right;
          }

          .invoice-table-cell.invoice-qty,
          .invoice-table-cell.invoice-gst {
            text-align: center;
            width: 40px;
          }

          .invoice-table-cell.invoice-price,
          .invoice-table-cell.invoice-total {
            text-align: right;
            width: 55px;
          }

          .invoice-summary {
            display: flex;
            justify-content: flex-end;
            gap: 0;
            margin-bottom: 0;
            font-size: 9px;
          }

          .invoice-summary-item {
            width: 140px;
            display: flex;
            justify-content: space-between;
            padding: 3px 4px;
            border-bottom: 1px solid #e5e7eb;
          }

          .invoice-summary-label {
            color: #6b7280;
            font-weight: 600;
          }

          .invoice-summary-value {
            color: #1f2937;
            font-weight: 600;
            text-align: right;
          }

          .invoice-summary-total {
            display: flex;
            justify-content: space-between;
            padding: 4px;
            background: #1f2937;
            color: white;
            font-weight: 700;
            font-size: 10px;
            border-radius: 3px;
          }

          .invoice-notes {
            font-size: 9px;
            color: #6b7280;
            margin-top: 8px;
            padding-top: 6px;
            border-top: 1px solid #e5e7eb;
            line-height: 1.3;
          }

          .invoice-footer {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            font-size: 9px;
            color: #6b7280;
            text-align: center;
          }

          .invoice-footer-item {
            flex: 1;
            padding-top: 4px;
            border-top: 1px solid #e5e7eb;
          }

          .text-right {
            text-align: right;
          }

          .invoice-page-2 {
            width: 100%;
            max-width: 148mm;
            background: white;
            padding: 6mm;
            page-break-before: always;
            page-break-after: avoid;
          }

          .invoice-terms-container {
            text-align: justify;
            line-height: 1.35;
          }

          .invoice-terms-title {
            font-weight: 700;
            color: #1f2937;
            margin-top: 6px;
            margin-bottom: 3px;
            font-size: 9px;
            text-align: left;
          }

          .invoice-terms-list {
            margin: 3px 0 6px 16px;
            padding: 0;
            list-style-type: decimal;
          }

          .invoice-terms-list li {
            margin-bottom: 2px;
            text-align: justify;
            font-size: 9px;
            color: #374151;
          }

          .invoice-terms-text {
            margin: 3px 0;
            font-size: 9px;
            color: #374151;
            text-align: justify;
          }

          @media print {
            body {
              margin: 0;
              padding: 0;
            }
            .invoice-container {
              box-shadow: none;
            }
            .invoice-page-2 {
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <!-- Header -->
          <div class="invoice-header">
            <div class="invoice-brand">
              <div class="invoice-title">Invoice</div>
              <div class="invoice-brand-detail">InstaRishta - Islamic Marriage Platform</div>
            </div>
            <div class="invoice-number">
              <span class="invoice-number-label">Invoice #</span>
              <span class="invoice-number-value">${this.escapeHtml(this.invoiceData.invoiceNumber)}</span>
            </div>
          </div>

          <!-- Logo Section -->
          ${
            this.invoiceData.logo
              ? `<div style="text-align: center; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb;">
                   <img src="${this.invoiceData.logo}" alt="Company Logo" style="max-height: 35px; max-width: 70px; object-fit: contain;">
                 </div>`
              : ""
          }

          <!-- Dates -->
          <div class="invoice-dates">
            <div class="invoice-date-item">
              <span class="invoice-date-label">Issue Date</span>
              <span class="invoice-date-value">${this.escapeHtml(this.invoiceData.invoiceDate)}</span>
            </div>
            <div class="invoice-date-item">
              <span class="invoice-date-label">Due Date</span>
              <span class="invoice-date-value">${this.escapeHtml(this.invoiceData.dueDate)}</span>
            </div>
          </div>

          <!-- Bill From / Bill To -->
          <div class="invoice-parties">
            <div class="invoice-party">
              <span class="invoice-party-label">From</span>
              <div class="invoice-party-name">${this.escapeHtml(this.invoiceData.from.name)}</div>
              <div class="invoice-party-detail">${this.escapeHtml(this.invoiceData.from.address)}</div>
              <div class="invoice-party-detail">${this.escapeHtml(this.invoiceData.from.email)}</div>
              <div class="invoice-party-detail">${this.escapeHtml(this.invoiceData.from.phone)}</div>
            </div>
            <div class="invoice-party">
              <span class="invoice-party-label">Bill To</span>
              <div class="invoice-party-name">${this.escapeHtml(this.invoiceData.billTo.name)}</div>
              <div class="invoice-party-detail">${this.escapeHtml(this.invoiceData.billTo.address)}</div>
              <div class="invoice-party-detail">${this.escapeHtml(this.invoiceData.billTo.email)}</div>
              <div class="invoice-party-detail">${this.escapeHtml(this.invoiceData.billTo.phone)}</div>
            </div>
          </div>

          <!-- Items Table -->
          <table class="invoice-items">
            <thead class="invoice-items-header">
              <tr>
                <th style="flex: 2;">Description</th>
                <th style="width: 40px; text-align: center;">Qty</th>
                <th style="width: 55px; text-align: right;">Unit Price</th>
                <th style="width: 40px; text-align: center;">GST %</th>
                <th style="width: 55px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>

          <!-- Summary -->
          <div class="invoice-summary">
            <div style="width: 140px;">
              <div class="invoice-summary-item">
                <span class="invoice-summary-label">Subtotal:</span>
                <span class="invoice-summary-value">${this.formatCurrency(totals.subtotal)}</span>
              </div>
              <div class="invoice-summary-item">
                <span class="invoice-summary-label">GST Included:</span>
                <span class="invoice-summary-value">₹${totals.gst.toFixed(2)}</span>
              </div>
              <div class="invoice-summary-total">
                <span>Total Due</span>
                <span>${this.formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Page 2: Terms & Conditions -->
        <div class="invoice-page-2">
          <!-- Terms & Conditions -->
          ${
            this.invoiceData.termsAndConditions
              ? `<div style="margin-bottom: 12px; font-size: 9px;">
                   ${this.parseTermsAndConditions(this.invoiceData.termsAndConditions)}
                 </div>`
              : ""
          }

          <!-- Person Info -->
          ${
            this.invoiceData.personName || this.invoiceData.personNumber
              ? `<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9px; text-align: right;">
                   ${this.invoiceData.personName ? `<div><strong>Contact:</strong> ${this.escapeHtml(this.invoiceData.personName)}</div>` : ""}
                   ${this.invoiceData.personNumber ? `<div><strong>Phone:</strong> ${this.escapeHtml(this.invoiceData.personNumber)}</div>` : ""}
                 </div>`
              : ""
          }

          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 8px; text-align: center; color: #6b7280;">
            <span>© 2024 InstaRishta. All rights reserved.</span>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate PDF from HTML using html2pdf library
   */
  async generatePDF() {
    // Load html2pdf library if not already loaded
    if (!window.html2pdf) {
      await this.loadHtml2PdfLibrary();
    }

    const element = document.createElement("div");
    element.innerHTML = this.generateInvoiceHTML();

    const options = {
      margin: 0,
      filename: `Invoice-${this.invoiceData.invoiceNumber}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: {
        orientation: "portrait",
        unit: "mm",
        format: "a5",
      },
    };

    return new Promise((resolve, reject) => {
      window
        .html2pdf()
        .set(options)
        .from(element)
        .save()
        .then(() => {
          resolve(true);
        })
        .catch(reject);
    });
  }

  /**
   * Print invoice (browser print dialog)
   */
  printInvoice() {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(this.generateInvoiceHTML());
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  /**
   * Load html2pdf library from CDN
   */
  loadHtml2PdfLibrary() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
}
