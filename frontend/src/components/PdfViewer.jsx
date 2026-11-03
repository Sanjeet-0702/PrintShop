import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import PageThumbnail from "./PageThumbnail";

// PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc =
  "/pdf.worker.min.mjs";

export default function PdfViewer({
  file,
  onSelectionChange,
}) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedPages, setSelectedPages] =
    useState(new Set());

  const [error, setError] = useState("");

  // =========================================
  // PDF loaded successfully
  // =========================================
  const handleDocumentLoad = ({
    numPages: loadedPages,
  }) => {
    setNumPages(loadedPages);
    setCurrentPage(1);
    setError("");

    // Select all pages initially
    const allPages = new Set(
      Array.from(
        { length: loadedPages },
        (_, index) => index + 1
      )
    );

    setSelectedPages(allPages);

    onSelectionChange?.(allPages);
  };

  // =========================================
  // PDF loading error
  // =========================================
  const handleDocumentError = (pdfError) => {
    console.error(
      "PDF loading error:",
      pdfError
    );

    setError(
      "Unable to display this PDF. Please try another PDF."
    );
  };

  // =========================================
  // Select / deselect page
  // =========================================
  const togglePage = (pageNumber) => {
    setSelectedPages((previous) => {
      const next = new Set(previous);

      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else {
        next.add(pageNumber);
      }

      onSelectionChange?.(next);

      return next;
    });
  };

  // =========================================
  // Select all
  // =========================================
  const selectAll = () => {
    const allPages = new Set(
      Array.from(
        { length: numPages },
        (_, index) => index + 1
      )
    );

    setSelectedPages(allPages);

    onSelectionChange?.(allPages);
  };

  // =========================================
  // Clear all
  // =========================================
  const selectNone = () => {
    const none = new Set();

    setSelectedPages(none);

    onSelectionChange?.(none);
  };

  // =========================================
  // Previous page
  // =========================================
  const previousPage = () => {
    setCurrentPage((page) =>
      Math.max(1, page - 1)
    );
  };

  // =========================================
  // Next page
  // =========================================
  const nextPage = () => {
    setCurrentPage((page) =>
      Math.min(numPages, page + 1)
    );
  };

  // =========================================
  // No file
  // =========================================
  if (!file) {
    return (
      <div className="pdf-empty">
        Upload a PDF to preview it.
      </div>
    );
  }

  return (
    <div className="pdf-viewer">

      {/* =====================================
          TOOLBAR
      ===================================== */}

      <div className="pdf-toolbar">

        <div className="pdf-toolbar-left">

          <strong>
            Document Preview
          </strong>

          {numPages > 0 && (
            <span>
              {numPages}{" "}
              {numPages === 1
                ? "page"
                : "pages"}
            </span>
          )}

        </div>

        <div className="pdf-toolbar-actions">

          <button
            type="button"
            onClick={selectAll}
          >
            Select all
          </button>

          <button
            type="button"
            onClick={selectNone}
          >
            Clear
          </button>

        </div>

      </div>

      {/* =====================================
          MAIN PDF PREVIEW
      ===================================== */}

      <div className="pdf-main-preview">

        <button
          type="button"
          className="page-nav"
          onClick={previousPage}
          disabled={currentPage <= 1}
        >
          ‹
        </button>

        <div className="pdf-page-container">

          <Document
            file={file}
            onLoadSuccess={
              handleDocumentLoad
            }
            onLoadError={
              handleDocumentError
            }
            loading={
              <div className="pdf-loading">
                Loading PDF...
              </div>
            }
          >

            <Page
              pageNumber={currentPage}
              width={420}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />

          </Document>

          <div className="page-counter">
            Page {currentPage} / {numPages}
          </div>

        </div>

        <button
          type="button"
          className="page-nav"
          onClick={nextPage}
          disabled={
            currentPage >= numPages
          }
        >
          ›
        </button>

      </div>

      {/* =====================================
          ERROR
      ===================================== */}

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {/* =====================================
          THUMBNAILS
      ===================================== */}

      {numPages > 0 && (

        <div className="thumbnail-area">

          <div className="thumbnail-heading">

            <strong>
              Select pages to print
            </strong>

            <span>
              {selectedPages.size} selected
            </span>

          </div>

          <div className="thumbnail-grid">

            {Array.from(
              { length: numPages },
              (_, index) => {

                const pageNumber =
                  index + 1;

                return (
                  <PageThumbnail
                    key={pageNumber}

                    // IMPORTANT:
                    // pass the PDF file
                    file={file}

                    pageNumber={
                      pageNumber
                    }

                    selected={
                      selectedPages.has(
                        pageNumber
                      )
                    }

                    onToggle={
                      togglePage
                    }
                  />
                );
              }
            )}

          </div>

        </div>

      )}

    </div>
  );
}