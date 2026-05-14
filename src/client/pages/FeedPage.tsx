import { useEffect, useState, useRef } from 'react';
import { navigateTo } from '@devvit/web/client';
import type { FeedPost } from '../../shared/rank-types';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';

interface FeedPageProps {
  onNavigate: (page: string) => void;
}

export function FeedPage({ onNavigate }: FeedPageProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Fetch initial feed
  useEffect(() => {
    const fetchFeed = async () => {
      try {
        setLoadingInitial(true);
        const response = await fetch('/api/rank/feed');

        if (!response.ok) {
          throw new Error('Failed to fetch feed');
        }

        const data = await response.json();
        if (data.status === 'success') {
          setPosts(data.posts);
          setCursor(data.cursor);
          setHasMore(data.posts.length > 0);
        }
      } catch (error) {
        console.error('Error fetching feed:', error);
        toast({
          description: 'Failed to load posts',
        });
      } finally {
        setLoadingInitial(false);
      }
    };

    void fetchFeed();
  }, [toast]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerTarget.current || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry || !firstEntry.isIntersecting || !cursor) return;
        
        try {
          setLoading(true);
          const response = await fetch(`/api/rank/feed?cursor=${cursor}`);

          if (!response.ok) {
            throw new Error('Failed to fetch more posts');
          }

          const data = await response.json();
          if (data.status === 'success' && data.posts.length > 0) {
            setPosts((prev) => [...prev, ...data.posts]);
            setCursor(data.cursor);
          } else {
            setHasMore(false);
          }
        } catch (error) {
          console.error('Error fetching more posts:', error);
          setHasMore(false);
        } finally {
          setLoading(false);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [cursor, hasMore, loading]);

  // Track post view
  const handlePostClick = async (post: FeedPost) => {
    try {
      // Track the view
      const response = await fetch('/api/rank/view-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      });

      if (response.ok) {
        toast({
          description: '✅ Post view counted!',
        });
      }

      // Open post in Reddit
      navigateTo(`https://reddit.com/${post.id}`);
    } catch (error) {
      console.error('Error tracking post view:', error);
      toast({
        description: 'Failed to track view',
      });
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4" />
          <p>Loading posts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('hub')}
          >
            ← Back
          </Button>
          <h1 className="text-2xl font-bold">Community Posts</h1>
        </div>
      </div>

      {/* Posts Grid */}
      <div className="space-y-3 mb-8">
        {posts.map((post, idx) => (
          <Card
            key={`${post.id}-${idx}`}
            className="p-4 bg-white hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => handlePostClick(post)}
          >
            <div className="flex gap-3">
              {/* Thumbnail */}
              {post.thumbnail && (
                <div className="flex-shrink-0 w-16 h-16 bg-slate-100 rounded overflow-hidden">
                  <img
                    src={post.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500 mb-1">
                  u/{post.author}
                </p>
                <h3 className="font-semibold text-sm mb-2 line-clamp-2">
                  {post.title}
                </h3>

                {/* Stats */}
                <div className="flex gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1">
                    ⬆️ {formatNumber(post.score)}
                  </span>
                  <span className="flex items-center gap-1">
                    💬 {formatNumber(post.commentCount)}
                  </span>
                </div>
              </div>

              {/* Tap indicator */}
              <div className="flex-shrink-0 text-slate-400">
                →
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Loading indicator for infinite scroll */}
      <div ref={observerTarget} className="flex justify-center py-8">
        {loading && (
          <div className="text-center">
            <div className="spinner mb-2" />
            <p className="text-sm text-slate-600">Loading more posts...</p>
          </div>
        )}
        {!loading && !hasMore && posts.length > 0 && (
          <p className="text-sm text-slate-500">No more posts</p>
        )}
      </div>

      {/* Empty state */}
      {posts.length === 0 && !loadingInitial && (
        <Card className="p-8 text-center bg-white">
          <p className="text-lg mb-4">No posts available</p>
          <Button onClick={() => onNavigate('hub')}>Back to Hub</Button>
        </Card>
      )}
    </div>
  );
}
