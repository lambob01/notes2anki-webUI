import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, File, X } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  onFile: (file: File) => void
  uploadedFile: any | null
}

export function FileDropZone({ onFile, uploadedFile }: Props) {
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
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/30 dark:border-green-800">
        <File className="w-5 h-5 text-green-600 dark:text-green-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">{uploadedFile.filename}</p>
          <p className="text-xs text-green-600 dark:text-green-400">
            {(uploadedFile.size_bytes / 1024).toFixed(1)} KB &middot; {uploadedFile.extension}
          </p>
        </div>
        <button
          onClick={() => onFile(null!)}
          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
        isDragActive
          ? 'border-red-600 bg-red-50 dark:border-red-500 dark:bg-red-900/30'
          : 'border-red-300 hover:border-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:border-red-500 dark:hover:bg-red-900/20'
      )}
    >
      <input {...getInputProps()} />
      <Upload className="w-10 h-10 text-red-600 mx-auto mb-3 dark:text-red-400" />
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {isDragActive
          ? 'Drop your file here...'
          : 'Drag and drop a file, or click to browse'}
      </p>
      <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
        PDF, PPTX, DOCX, TXT, MD, PNG, JPG, BMP, GIF, WEBP
      </p>
    </div>
  )
}
