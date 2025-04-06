// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'LIB/pdf.worker.min_2.12.313.js';

const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const thumbnailContainer = document.getElementById('thumbnailContainer');
const mergeBtn = document.getElementById('mergeBtn');

let pdfFiles = [];

// Set up drag and drop
// both the methods do the same work, but put in two way of writing. 
// adding event listner to dropArea
//When someone clicks on the dropArea, it programmatically "clicks" the hidden fileInput, which opens the file selection dialog.
// dropArea.addEventListener('click', () => fileInput.click());
dropArea.addEventListener('click', function() {
  fileInput.click();
});

//When you drag something (like a file) over the drop area, 
//this code stops the browser from blocking the drop, and adds a visual "highlight" effect to show users that they can drop it there.
dropArea.addEventListener('dragover', function(e) {
  e.preventDefault();
  dropArea.classList.add('highlight');
});

// When you drag a file over the drop area and then move it away without dropping, 
// this code removes the highlight effect from the area — to show that it’s no longer active or ready for a drop.
dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('highlight');
});

// When someone drops file(s) into the drop area:
// Stop the browser from doing something unexpected.
// Remove the "highlight" effect from the drop area.
// Get the dropped file(s).
// Hand them over to a function that processes them "handleFiles"

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('highlight');
    handleFiles(e.dataTransfer.files);
});

// When a user selects file(s) using the file input (click and browse):
// Check that some files were actually selected.
// Then send those files to the handleFiles() function for further processing (like previewing or uploading).
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFiles(fileInput.files);
    }
});

// event handler when user click "merge PDFs" button
mergeBtn.addEventListener('click', mergePDFs);


// This handleFiles() function takes a list of files and Filters for only PDFs.
// If a file is not PDF and can be converted to PDF, it will convert by taking user permission
// Reads each one and generates a small image preview of the first page.
// Stores the preview and other info for display and merging.
 
async function handleFiles(files) {
    //const pdfFilesArray = Array.from(files).filter(file => file.type === 'application/pdf');
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type === 'application/pdf') {
            pdfFilesArray.push(file);
        } else {
            const confirmConversion = confirm(`"${file.name}" is not a PDF. Do you want to convert it to PDF and merge?`);
            if (confirmConversion) {
                try {
                    const convertedPdfFile = await convertToPDF(file);
                    if (convertedPdfFile) {
                        pdfFilesArray.push(convertedPdfFile);
                    }
                } catch (error) {
                    alert(`Failed to convert "${file.name}" to PDF: ${error.message}`);
                    console.error(error);
                }
            }
        }
    }

    if (pdfFilesArray.length === 0) {
        alert('Please select PDF files only or files that can be converted to PDF.');
        return;
    }
    
    for (const file of pdfFilesArray) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            // Get first page for thumbnail
            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 0.2 });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            const thumbnailUrl = canvas.toDataURL();
            const pageCount = pdfDoc.numPages;
            
            pdfFiles.push({
                file,
                arrayBuffer,
                thumbnailUrl,
                pageCount
            });
            
            renderThumbnails();
        } catch (error) {
            console.error('Error processing PDF:', error);
            alert(`Error processing ${file.name}: ${error.message}`);
        }
    }
    
    if (pdfFiles.length > 0) {
        mergeBtn.disabled = false;
    }
}

function renderThumbnails() {
    thumbnailContainer.innerHTML = '';
    
    pdfFiles.forEach((pdfFile, index) => {
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'thumbnail';
        thumbnailDiv.draggable = true;
        thumbnailDiv.dataset.index = index;
        
        thumbnailDiv.innerHTML = `
            <span class="page-number">Page 1 of ${pdfFile.pageCount}</span>
            <button class="remove-btn" data-index="${index}">×</button>
            <img src="${pdfFile.thumbnailUrl}" alt="${pdfFile.file.name}">
            <div class="file-info">${pdfFile.file.name} (${(pdfFile.file.size / 1024).toFixed(1)} KB)</div>
            <button class="move-up" data-index="${index}">↑</button>
            <button class="move-down" data-index="${index}">↓</button>
        `;
        
        thumbnailContainer.appendChild(thumbnailDiv);
        
        // Set up drag and drop for reordering
        thumbnailDiv.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            setTimeout(() => thumbnailDiv.classList.add('dragging'), 0);
        });
        
        thumbnailDiv.addEventListener('dragend', () => {
            thumbnailDiv.classList.remove('dragging');
        });
    });
    
    // Set up drop targets for reordering
    thumbnailContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingElement = document.querySelector('.thumbnail.dragging');
        const afterElement = getDragAfterElement(thumbnailContainer, e.clientY);
        if (afterElement == null) {
            thumbnailContainer.appendChild(draggingElement);
        } else {
            thumbnailContainer.insertBefore(draggingElement, afterElement);
        }
    });
    
    // Set up remove buttons
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            pdfFiles.splice(index, 1);
            renderThumbnails();
            if (pdfFiles.length === 0) {
                mergeBtn.disabled = true;
            }
        });
    });
    
    // Set up move up buttons
    document.querySelectorAll('.move-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            if (index > 0) {
                [pdfFiles[index], pdfFiles[index - 1]] = [pdfFiles[index - 1], pdfFiles[index]];
                renderThumbnails();
            }
        });
    });
    
    // Set up move down buttons
    document.querySelectorAll('.move-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            if (index < pdfFiles.length - 1) {
                [pdfFiles[index], pdfFiles[index + 1]] = [pdfFiles[index + 1], pdfFiles[index]];
                renderThumbnails();
            }
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.thumbnail:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

async function mergePDFs() {
    if (pdfFiles.length === 0) return;
    
    mergeBtn.disabled = true;
    mergeBtn.textContent = 'Merging...';
    
    try {
        // Create a new PDF document
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        
        // Copy pages from each PDF
        for (const pdfFile of pdfFiles) {
            const pdfDoc = await PDFDocument.load(pdfFile.arrayBuffer);
            const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        
        // Save the merged PDF
        const mergedPdfBytes = await mergedPdf.save();
        
        // Create download link
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Error merging PDFs:', error);
        alert(`Error merging PDFs: ${error.message}`);
    } finally {
        mergeBtn.disabled = false;
        mergeBtn.textContent = 'Merge PDFs';
    }
}

/**
 * Converts a file (image or text) to PDF
 * @param {File} file - Input file (image or text)
 * @returns {Promise<{filename: string, blob: Blob}>} - PDF filename and Blob
 */
async function convertToPDF(file) {
  const { PDFDocument, rgb } = PDFLib;

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]); // Default page size

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const pdfFilename = `${baseName}_${timestamp}.pdf`;

  try {
    if (file.type.startsWith('image/')) {
      // Handle image conversion
      await addImageToPDF(pdfDoc, page, file);
    } else if (file.type === 'text/plain') {
      // Handle text conversion
      alert(1);
      await addTextToPDF(pdfDoc, page, file);
      alert(2);
    } else {
      throw new Error('Unsupported file type');
    }

    // Save and return
    const pdfBytes = await pdfDoc.save();
    return {
      filename: pdfFilename,
      blob: new Blob([pdfBytes], { type: 'application/pdf' })
    };

  } catch (error) {
    console.error('Conversion error:', error);
    throw new Error(`Failed to convert ${file.name} to PDF`);
  }
}

// Helper: Add image to PDF
async function addImageToPDF(pdfDoc, page, imageFile) {
  const imageBytes = await imageFile.arrayBuffer();
  let image;
  
  if (imageFile.type === 'image/jpeg') {
    image = await pdfDoc.embedJpg(imageBytes);
  } else if (imageFile.type === 'image/png') {
    image = await pdfDoc.embedPng(imageBytes);
  } else {
    throw new Error('Unsupported image format');
  }

  // Scale image to fit page (maintaining aspect ratio)
  const { width, height } = image.scale(0.5);
  page.drawImage(image, {
    x: 50,
    y: page.getHeight() - height - 50,
    width,
    height,
  });
}

// Helper: Add text to PDF
async function addTextToPDF(pdfDoc, page, textFile) {
  const textContent = await textFile.text();
  const lines = textContent.split('\n');
  const fontSize = 12;
  const lineHeight = 15;
  let yPosition = page.getHeight() - 50;
  alert(3);
  // Embed standard font
  const font = await pdfDoc.embedFont(PDFDocument.StandardFonts.Helvetica);
alert(4);
  // Draw each line with proper line breaks
  for (const line of lines) {
    if (yPosition < 50) { // Add new page if needed
      page = pdfDoc.addPage([600, 800]);
      yPosition = page.getHeight() - 50;
    }
    alert(5);
    page.drawText(line, {
      x: 50,
      y: yPosition,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
      maxWidth: 500,
    });
    alert(6);
    yPosition -= lineHeight;
  }
}
