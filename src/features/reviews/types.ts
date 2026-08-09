export interface ProductReview {
  id: string;
  customerName: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

export interface ProductRatingSummary {
  averageRating: number | null;
  reviewCount: number;
}
