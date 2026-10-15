import { useEffect, useState } from 'react';
import { SHOP_INFO, ShopInfo } from '../config/shop';
import { fetchShopInfo } from '../api/shop';

/** Hook tải thông tin shop từ backend, fallback về placeholder trong config. */
export function useShopInfo(): ShopInfo {
  const [shop, setShop] = useState<ShopInfo>(SHOP_INFO);

  useEffect(() => {
    let mounted = true;
    fetchShopInfo().then((info) => {
      if (mounted) setShop(info);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return shop;
}
