import { useState, useEffect, useMemo } from 'react';

/**
 * Senior hook for client-side pagination with automatic page bounding and reset triggers
 */
export function useClientPagination<T>(
  items: T[],
  initialPageSize = 25,
  resetTrigger?: unknown
) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Auto-correct page if items filtered down
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Optional reset trigger when search query or filter changes
  useEffect(() => {
    if (resetTrigger !== undefined) {
      setCurrentPage(1);
    }
  }, [resetTrigger]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const resetPage = () => {
    setCurrentPage(1);
  };

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalCount,
    totalPages,
    paginatedItems,
    resetPage,
  };
}
