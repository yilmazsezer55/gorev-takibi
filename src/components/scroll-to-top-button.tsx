
'use client';

import * as React from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ScrollToTopButton() {
  const [isVisible, setIsVisible] = React.useState(false);

  const toggleVisibility = () => {
    if (window.pageYOffset > 300) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  React.useEffect(() => {
    window.addEventListener('scroll', toggleVisibility);
    return () => {
      window.removeEventListener('scroll', toggleVisibility);
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <Button
        size="icon"
        onClick={scrollToTop}
        className={cn(
          'rounded-full h-12 w-12 transition-opacity duration-300',
          isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        aria-label="Başa dön"
      >
        <ArrowUp className="h-6 w-6" />
      </Button>
    </div>
  );
}

