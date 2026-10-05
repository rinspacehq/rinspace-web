import { expect, test } from "vitest";
import {
  homeFeedForSharedCache,
  type FeedItem,
  type HomeFeed,
} from "./feed";

const reviewedBook: FeedItem = {
  id: "41",
  type: "book",
  title: "评分缓存测试",
  author: "Rin",
  meta: "书籍",
  excerpt: "",
  tags: [],
  interactions: "4 人评分",
  heat: "",
  bookRating: {
    averageScore: 9.2,
    reviewCount: 4,
    breakdown: [],
    myReview: {
      id: "701",
      bookId: "41",
      score: 10,
      stars: 5,
      body: "值得重读",
      author: "测试用户",
      voteCount: 0,
      voteStatus: "none",
      createdAt: "2026-08-26T00:00:00Z",
      updatedAt: "2026-08-26T00:00:00Z",
    },
  },
};

const feed: HomeFeed = {
  featuredBlog: {
    id: "1",
    type: "blog",
    title: "首页文章",
    author: "Rin",
    meta: "文章",
    excerpt: "",
    tags: [],
    interactions: "",
    heat: "",
    liked: true,
    collectionActive: true,
    reaction_summary: [{ emoji: "heart", count: 2, tooltip: "", is_active: true }],
  },
  stream: [reviewedBook],
  questionHotlist: [],
  community: [],
  announcements: [],
  tasks: [],
  followedTags: [],
  generatedAt: "2026-08-26T00:00:00Z",
};

test("shared home cache strips personalized book reviews", () => {
  const cached = homeFeedForSharedCache(feed);

  expect(cached.stream[0]?.bookRating).toEqual({
    averageScore: 9.2,
    reviewCount: 4,
    breakdown: [],
  });
  expect(feed.stream[0]?.bookRating?.myReview?.id).toBe("701");
  expect(cached.featuredBlog.liked).toBe(false);
  expect(cached.featuredBlog.collectionActive).toBe(false);
  expect(cached.featuredBlog.reaction_summary?.[0]?.is_active).toBe(false);
  expect(feed.featuredBlog.collectionActive).toBe(true);
});
