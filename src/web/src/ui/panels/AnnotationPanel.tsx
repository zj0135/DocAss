import React from 'react';
import type { Annotation } from '../../contracts';
import { AnnotationList } from '../../annotations/AnnotationList';

interface AnnotationPanelProps {
  documentAnnotations: Annotation[];
  pageCount?: number;
  selectedAnnotationId?: string;
  onSelectAnnotation: (id: string, page: number) => void;
  onDeleteAnnotation: (id: string, e: React.MouseEvent) => void;
  onClose: () => void;
}

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  selectedAnnotationId,
  onSelectAnnotation,
  onDeleteAnnotation,
  onClose,
  documentAnnotations,
  pageCount = 1,
}) => {
  return (
    <AnnotationList
      annotations={documentAnnotations}
      pageCount={pageCount}
      selectedAnnotationId={selectedAnnotationId}
      onSelectAnnotation={onSelectAnnotation}
      onDeleteAnnotation={onDeleteAnnotation}
      onClose={onClose}
    />
  );
};
