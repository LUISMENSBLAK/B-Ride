import { useMemo } from 'react';
import * as Localization from 'expo-localization';

export type CurrencyType = 'USD' | 'MXN' | 'EUR';

export function useCurrency() {
    const currency = useMemo<CurrencyType>(() => {
        // Use region for detection or explicit hardcodings if known
        // US → USD, MX → MXN, ES/FR/DE/IT/PT → EUR
        const locales = Localization.getLocales();
        const regionCode = locales[0]?.regionCode || 'MX'; // Default MX as requested

        if (regionCode === 'US') return 'USD';
        if (regionCode === 'MX') return 'MXN';
        if (['ES', 'FR', 'DE', 'IT', 'PT'].includes(regionCode)) return 'EUR';
        
        return 'MXN'; // fallback
    }, []);

    const RATES: Record<CurrencyType, number> = {
        USD: 1.0,
        MXN: 17.5,
        EUR: 0.92
    };

    const formatPrice = (amountUsd: number | string, overrideCurrency?: CurrencyType) => {
        const c = overrideCurrency || currency;
        const numAmount = typeof amountUsd === 'string' ? parseFloat(amountUsd) : amountUsd;
        
        if (isNaN(numAmount)) return '';

        // Convert from USD to target currency
        const localAmount = numAmount * RATES[c];

        let localeStr = 'es-MX';
        if (c === 'USD') localeStr = 'en-US';
        if (c === 'EUR') localeStr = 'es-ES'; // Default eur formatting

        return new Intl.NumberFormat(localeStr, {
            style: 'currency',
            currency: c,
        }).format(localAmount);
    };

    const convertToUsd = (localAmount: number | string) => {
        const numAmount = typeof localAmount === 'string' ? parseFloat(localAmount) : localAmount;
        if (isNaN(numAmount)) return 0;
        return numAmount / RATES[currency];
    };

    const convertToLocal = (usdAmount: number | string) => {
        const numAmount = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
        if (isNaN(numAmount)) return 0;
        return numAmount * RATES[currency];
    };

    return { currency, formatPrice, convertToUsd, convertToLocal };
}
