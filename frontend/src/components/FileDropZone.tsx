import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileText, Upload, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatBytes } from '@/lib/format'

interface Props {
  onFile: (file: File) => void
  onClear: () => void
  uploadedFile: any | null
}

const FORMATS = 'PDF, PPTX, DOCX, TXT, MD, PNG, JPG, BMP, GIF, WEBP'

export function FileDropZone({ onFile, onClear, uploadedFile }: Props) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) onFile(acceptedFiles[0])
    },
    [onFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/bmp': ['.bmp'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
    },
  })

  if (uploadedFile) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-raised/60 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-panel">
          <FileText className="h-4 w-4 text-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{uploadedFile.filename}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">
            {formatBytes(uploadedFile.size_bytes)} · {uploadedFile.extension}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove file"
          className="rounded-md p-1.5 text-faint transition-colors hover:bg-panel hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'group cursor-pointer rounded-lg border border-dashed px-6 py-10 text-center transition-colors',
        isDragActive
          ? 'border-ink bg-raised'
          : 'border-line bg-panel/40 hover:border-line-strong hover:bg-raised/40'
      )}
    >
      <input {...getInputProps()} />
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-muted transition-colors group-hover:text-ink">
        <Upload className="h-4 w-4" />
      </span>
      <p className="text-[13px] text-ink">
        {isDragActive ? 'Drop the file here' : 'Drag a lecture file here, or click to browse'}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{FORMATS}</p>
    </div>
  )
}
