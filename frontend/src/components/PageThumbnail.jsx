import React from "react";
import { Document, Page } from "react-pdf";

export default function PageThumbnail({
  file,
  pageNumber,
  selected,
  onToggle,
}) {
  return (
    <button
      type="button"
      className={
        selected
          ? "thumbnail thumbnail-selected"
          : "thumbnail"
      }
      onClick={() =>
        onToggle(pageNumber)
      }
    >
      <div className="thumbnail-page">

        <Document file={file}>

          <Page
            pageNumber={pageNumber}
            width={120}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />

        </Document>

      </div>

      <div className="thumbnail-footer">

        <span>
          Page {pageNumber}
        </span>

        <span className="thumbnail-check">
          {selected ? "✓" : ""}
        </span>

      </div>

    </button>
  );
}