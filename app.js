// ======================
// SECURITY CONFIGURATION
// ======================
const SECURITY_CONFIG = Object.freeze({
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB
    MAX_PAGES: 500, // Total pages across all documents
    MAX_DOCUMENTS: 20,
    ALLOWED_MIME_TYPES: ['application/pdf'],
    ALLOWED_EXTENSIONS: ['.pdf'],
    PDF_HEADER: [0x25, 0x50, 0x44, 0x46], // %PDF
    WATERMARK_TEXT: `Secure PDF Merger - ${new Date().toISOString().split('T')[0]}`
});

// =================
// SECURITY UTILITIES
// =================
class SecurityUtils {
    static escapeHtml(unsafe) {
        return unsafe.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[match]));
    }

    static async readFileHeader(file, bytes = 4) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(new Uint8Array(reader.result.slice(0, bytes)));
            reader.readAsArrayBuffer(file.slice(0, bytes));
        });
    }

    static async validateFileBasic(file) {
        // Frontend validation (quick checks)
        const extension = file.name.toLowerCase().slice(-4);
        if (!SECURITY_CONFIG.ALLOWED_EXTENSIONS.includes(extension)) {
            throw new Error('Invalid file extension. Only PDF files are allowed.');
        }
        
        if (file.size > SECURITY_CONFIG.MAX_FILE_SIZE) {
            throw new Error(`File size exceeds ${SECURITY_CONFIG.MAX_FILE_SIZE/1024/1024}MB limit`);
        }
        
        return true;
    }

    static async validateFileAdvanced(file) {
        try {
            // Check MIME type (if browser provides it)
            if (file.type && !SECURITY_CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
                throw new Error('Invalid file type');
            }

            // Verify PDF header (magic number)
            const header = await this.readFileHeader(file);
            if (!header.every((val, i) => val === SECURITY_CONFIG.PDF_HEADER[i])) {
                throw new Error('Invalid PDF header (not a PDF file)');
            }

            // Full PDF.js validation
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ 
                data: arrayBuffer,
                disableFontFace: true,  // Prevent font parsing vulnerabilities
                disableRange: true     // Disable range requests for whole-file validation
            }).promise;

            // Page count validation
            if (pdfDoc.numPages > 100) {
                throw new Error(`Document has too many pages (${pdfDoc.numPages} > 100 limit)`);
            }

            return pdfDoc.numPages;
        } catch (error) {
            if (error.name === 'InvalidPDFException') {
                throw new Error('Corrupted or invalid PDF structure');
            } else if (error.message.includes('password')) {
                throw new Error('Password-protected PDFs are not supported');
            }
            throw new Error(`PDF validation failed: ${error.message}`);
        }
    }
}

// ======================
// PDF MERGER CORE CLASS
// ======================
class SecurePDFMerger {
    constructor() {
        this.pdfFiles = [];
        this.totalPages = 0;
        this.initEventListeners();
        this.setupSecurityObservers();
    }

    setupSecurityObservers() {
        // Monitor for potential XSS attempts
        document.addEventListener('DOMNodeInserted', (e) => {
            if (e.target.tagName === 'SCRIPT' && 
                !e.target.src?.startsWith('https://cdnjs.cloudflare.com/')) {
                console.warn('Blocked potentially unsafe script insertion');
                e.target.remove();
            }
        });

        // Protect against prototype pollution
        Object.freeze(Object.prototype);
        Object.freeze(Array.prototype);
    }

    // ... [rest of your methods remain exactly the same as in previous implementation] ...
}

// ======================
// APPLICATION INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', () => {
    // Environment checks
    if (!window.isSecureContext) {
        document.body.innerHTML = `
            <div style="color: red; padding: 20px; border: 1px solid red; margin: 20px;">
                <h2>Security Alert</h2>
                <p>This application requires a secure (HTTPS) connection</p>
            </div>
        `;
        return;
    }

    // Wait for PDF.js to be fully ready
    const checkPDFJS = setInterval(() => {
        if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions.workerSrc) {
            clearInterval(checkPDFJS);
            try {
                new SecurePDFMerger();
            } catch (error) {
                console.error('Initialization Error:', error);
                document.body.innerHTML = `
                    <div style="color: red; padding: 20px; border: 1px solid red; margin: 20px;">
                        <h2>Initialization Error</h2>
                        <p>${SecurityUtils.escapeHtml(error.message)}</p>
                    </div>
                `;
            }
        }
    }, 100);
});
