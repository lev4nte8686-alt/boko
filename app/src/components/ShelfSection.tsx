import React, { useRef } from 'react';
import { Book, Currency } from '../types';

interface ShelfSectionProps {
  title: string;
  books: Book[];
  onSelectBook: (book: Book) => void;
  onAddToCart: (book: Book) => void;
  currency: Currency;
}

export const ShelfSection: React.FC<ShelfSectionProps> = ({
  title,
  books,
  onSelectBook,
  onAddToCart,
  currency
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -360 : 360;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section className="mb-14 md:mb-20 relative">
      {/* Category Shelf Header Plaque */}
      <div className="px-4 md:px-12 mb-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3 bg-amber-950/70 border border-amber-500/30 px-4 py-2 rounded-xl backdrop-blur-md shadow-md">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-300"></div>
          <h2 className="font-display text-xl md:text-2xl font-bold text-amber-100 tracking-tight">
            KỆ SÁCH: {title}
          </h2>
          <span className="text-xs font-mono text-amber-300/90 bg-amber-900/80 px-2.5 py-0.5 rounded-md border border-amber-600/40 font-semibold">
            {books.length} cuốn
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Scroll Controls */}
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 rounded-lg bg-amber-900/80 border border-amber-600/40 hover:bg-amber-800 text-amber-100 flex items-center justify-center transition-colors shadow-sm active:scale-95 cursor-pointer"
            title="Cuộn sang trái"
          >
            <i className="fa-solid fa-chevron-left text-xs"></i>
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 rounded-lg bg-amber-900/80 border border-amber-600/40 hover:bg-amber-800 text-amber-100 flex items-center justify-center transition-colors shadow-sm active:scale-95 cursor-pointer"
            title="Cuộn sang phải"
          >
            <i className="fa-solid fa-chevron-right text-xs"></i>
          </button>
        </div>
      </div>

      {/* Books Horizontal Carousel / Shelf Container */}
      <div className="relative w-full group/shelf">
        {/* Left Floating Arrow Button */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-1 sm:left-3 top-[42%] -translate-y-1/2 z-20 w-9 h-9 md:w-11 md:h-11 rounded-full bg-amber-950/90 border border-amber-500/60 hover:bg-amber-800 text-amber-200 hover:text-amber-100 flex items-center justify-center transition-all shadow-xl backdrop-blur-md active:scale-95 hover:scale-110 opacity-80 sm:opacity-0 group-hover/shelf:opacity-100 focus:opacity-100 cursor-pointer"
          title="Lướt sang trái"
          aria-label="Lướt sang trái"
        >
          <i className="fa-solid fa-chevron-left text-sm md:text-base"></i>
        </button>

        {/* Right Floating Arrow Button */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-1 sm:right-3 top-[42%] -translate-y-1/2 z-20 w-9 h-9 md:w-11 md:h-11 rounded-full bg-amber-950/90 border border-amber-500/60 hover:bg-amber-800 text-amber-200 hover:text-amber-100 flex items-center justify-center transition-all shadow-xl backdrop-blur-md active:scale-95 hover:scale-110 opacity-80 sm:opacity-0 group-hover/shelf:opacity-100 focus:opacity-100 cursor-pointer"
          title="Lướt sang phải"
          aria-label="Lướt sang phải"
        >
          <i className="fa-solid fa-chevron-right text-sm md:text-base"></i>
        </button>

        <div
          ref={scrollContainerRef}
          className="flex overflow-x-auto hide-scrollbar pl-6 sm:pl-10 md:pl-12 pr-6 sm:pr-10 md:pr-12 scroll-pl-6 sm:scroll-pl-10 md:scroll-pl-12 gap-6 md:gap-8 pb-4 snap-x snap-mandatory items-end"
        >
          {books.map((book) => {
            const formattedPrice =
              currency === 'EUR'
                ? `€ ${book.priceEUR.toFixed(2)}`
                : `${book.priceVND.toLocaleString('vi-VN')} ₫`;

            const formattedOriginalPrice =
              book.originalPriceVND && currency === 'VND'
                ? `${book.originalPriceVND.toLocaleString('vi-VN')} ₫`
                : null;

            return (
              <div
                key={book.id}
                className="book-wrapper flex-none w-[165px] md:w-[215px] snap-start group relative first:ml-2 sm:first:ml-4"
              >
                {/* Book Cover Container */}
                <div
                  onClick={() => onSelectBook(book)}
                  className="relative h-[240px] md:h-[300px] w-full rounded-r-md rounded-l-xs overflow-hidden book-cover bg-[#2a2421] cursor-pointer shadow-md"
                >
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    /* Fallback tactile monochrome cover for books without explicit image */
                    <div
                      style={{ backgroundColor: book.bgColor || '#5d4037' }}
                      className="w-full h-full flex flex-col items-center justify-between p-5 text-white text-center shadow-inner relative"
                    >
                      <div className="border border-white/20 w-full h-full p-4 flex flex-col items-center justify-center">
                        <span className="text-[10px] uppercase tracking-widest text-white/70 mb-2 font-mono">
                          BOKO
                        </span>
                        <h3 className="font-display font-bold text-base md:text-lg leading-snug line-clamp-3">
                          {book.title}
                        </h3>
                        <p className="font-body text-xs text-white/80 mt-2 font-light italic truncate w-full">
                          {book.author}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Spine highlight overlay */}
                  <div className="absolute top-0 bottom-0 left-0 w-3 bg-gradient-to-r from-white/35 via-white/10 to-transparent pointer-events-none"></div>

                  {/* Top-Right Discount Badge */}
                  {book.discountPercent && book.discountPercent > 0 && (
                    <div className="absolute top-2 right-2 z-10 bg-red-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-md shadow-md border border-red-400">
                      -{book.discountPercent}%
                    </div>
                  )}

                  {/* Top-Left Official Seller Pill */}
                  {book.brandName && (
                    <div className="absolute top-2 left-2 z-10 bg-slate-950/85 backdrop-blur-xs text-amber-200 font-semibold text-[9px] px-1.5 py-0.5 rounded-md shadow-xs border border-amber-500/40 flex items-center gap-1 max-w-[120px] truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                      <span className="truncate">{book.brandName}</span>
                    </div>
                  )}

                  {/* Hover Quick Actions Overlay */}
                  <div className="absolute inset-0 bg-slate-950/85 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4 gap-2 text-white backdrop-blur-[2px]">
                    <div className="text-center mb-1">
                      <span className="text-[10px] uppercase tracking-widest text-amber-300 font-bold block">
                        {book.brandName || 'CHÍNH HÃNG'}
                      </span>
                      <span className="text-[11px] text-slate-300">
                        {book.editionType || 'Bìa Mềm'}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectBook(book);
                      }}
                      className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs py-2 px-3 rounded-lg tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <i className="fa-solid fa-book-open-reader text-xs"></i>
                      <span>Đọc thử</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToCart(book);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2 px-3 rounded-lg tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-md shadow-blue-200 transition-all cursor-pointer"
                    >
                      <i className="fa-solid fa-cart-plus text-xs"></i>
                      <span>Thêm vào giỏ</span>
                    </button>
                  </div>
                </div>

                {/* Book Metadata Card below cover */}
                <div className="mt-2.5 px-2.5 py-2 rounded-xl bg-slate-900/90 border border-amber-900/40 backdrop-blur-xs">
                  <h3
                    onClick={() => onSelectBook(book)}
                    className="font-display font-bold text-xs md:text-sm text-amber-100 truncate hover:text-amber-300 cursor-pointer transition-colors"
                    title={book.title}
                  >
                    {book.title}
                  </h3>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-amber-300/80">
                    <span className="truncate max-w-[95px] text-slate-400 font-medium">
                      {book.author}
                    </span>
                    <span className="truncate max-w-[90px] text-blue-300 font-semibold flex items-center gap-0.5">
                      <i className="fa-solid fa-circle-check text-blue-400 text-[10px]"></i>
                      <span className="truncate">{book.brandName?.replace(' Official', '').replace('Nhà Sách ', '') || 'Boko'}</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline mt-1.5 pt-1.5 border-t border-amber-900/40">
                    {formattedOriginalPrice ? (
                      <span className="font-body text-[10px] text-slate-400 line-through">
                        {formattedOriginalPrice}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">{book.editionType || 'Bìa mềm'}</span>
                    )}
                    <span className="font-body text-xs font-bold text-amber-300">
                      {formattedPrice}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Physical Wooden/Slate Shelf Beam Ledge with End Brackets */}
        <div className="relative w-full h-8 shelf-beam-3d rounded-sm z-0 flex items-center justify-between px-2 shadow-xl">
          {/* Left Shelf Joint Bracket */}
          <div className="w-5 h-full bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-700 rounded-s-xs border-r border-amber-900/50 shadow-inner flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-950"></div>
          </div>

          {/* Brass Front Lip Molding Trim */}
          <div className="flex-1 h-1 bg-gradient-to-r from-amber-500/20 via-amber-300/40 to-amber-500/20 mx-2 rounded-full"></div>

          {/* Right Shelf Joint Bracket */}
          <div className="w-5 h-full bg-gradient-to-l from-amber-300 via-yellow-500 to-amber-700 rounded-e-xs border-l border-amber-900/50 shadow-inner flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-950"></div>
          </div>
        </div>
      </div>
    </section>
  );
};
