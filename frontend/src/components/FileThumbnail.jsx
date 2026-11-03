import React, { useState, useEffect } from "react";

export default function FileThumbnail({
  file,
  fileType,
  storedFilename,
  apiUrl = "http://127.0.0.1:8000",
  width = 110,
  height = 140,
  className = "",
}) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [objectUrl, setObjectUrl] = useState(null);

  const isImage =
    fileType === "image" ||
    (file && file.type && file.type.startsWith("image/")) ||
    (file && file.name && /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name));

  useEffect(() => {
    if (isImage && file instanceof Blob) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setObjectUrl(null);
  }, [file, isImage]);

  // Front page preview:
  let previewSrc = null;
  if (storedFilename) {
    previewSrc = `${apiUrl}/api/files/${encodeURIComponent(storedFilename)}/preview?page=1&dpi=120`;
  } else if (objectUrl) {
    previewSrc = objectUrl;
  }

  return (
    <div
      className={`ps-thumb-container ${className}`}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        background: "#f8fafc",
        borderRadius: "8px",
      }}
    >
      {previewSrc && !loadError ? (
        <>
          {!loaded && (
            <div className="ps-thumb-loading-placeholder">
              <div className="ps-thumb-skeleton" />
            </div>
          )}
          <img
            src={previewSrc}
            alt={file?.name || "Document Front Page"}
            className="ps-thumb-rendered-img"
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: loaded ? "block" : "none",
              borderRadius: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            onLoad={() => {
              setLoaded(true);
              setLoadError(false);
            }}
            onError={() => {
              setLoadError(true);
            }}
          />
        </>
      ) : (
        <div className="file-thumb-fallback">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.6">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span style={{ fontSize: "11px", color: "#475569", marginTop: "4px", fontWeight: "600" }}>
            {file?.name ? file.name.split(".").pop().toUpperCase() : "Document"}
          </span>
        </div>
      )}
    </div>
  );
}
