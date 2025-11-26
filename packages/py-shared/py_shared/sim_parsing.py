"""Shared helpers for parsing monetary values and geographic hints from free text."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Optional

DEFAULT_BASE_REVENUE = 200_000.0
DEFAULT_CURRENCY_CODE = "EUR"

_NBSP = "\u00A0"

_CURRENCY_SYMBOLS: Dict[str, str] = {
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "JPY": "¥",
    "CNY": "¥",
    "CAD": "C$",
    "AUD": "A$",
    "NZD": "NZ$",
    "SGD": "S$",
    "HKD": "HK$",
    "CHF": "CHF",
    "SEK": "kr",
    "NOK": "kr",
    "DKK": "kr",
    "INR": "₹",
    "BRL": "R$",
    "MXN": "MX$",
    "ZAR": "R",
    "TRY": "₺",
    "AED": "د.إ",
    "PLN": "zł",
}

_CURRENCY_ALIASES: Dict[str, str] = {
    "$": "USD",
    "usd": "USD",
    "us$": "USD",
    "dollar": "USD",
    "dollars": "USD",
    "€": "EUR",
    "eur": "EUR",
    "euro": "EUR",
    "euros": "EUR",
    "£": "GBP",
    "gbp": "GBP",
    "pound": "GBP",
    "pounds": "GBP",
    "sterling": "GBP",
    "¥": "JPY",
    "jpy": "JPY",
    "yen": "JPY",
    "cny": "CNY",
    "rmb": "CNY",
    "yuan": "CNY",
    "cad": "CAD",
    "c$": "CAD",
    "aud": "AUD",
    "a$": "AUD",
    "nzd": "NZD",
    "nz$": "NZD",
    "sgd": "SGD",
    "s$": "SGD",
    "hkd": "HKD",
    "hk$": "HKD",
    "chf": "CHF",
    "sek": "SEK",
    "nok": "NOK",
    "dkk": "DKK",
    "inr": "INR",
    "₹": "INR",
    "rupee": "INR",
    "rupees": "INR",
    "brl": "BRL",
    "r$": "BRL",
    "mxn": "MXN",
    "mx$": "MXN",
    "peso": "MXN",
    "pesos": "MXN",
    "zar": "ZAR",
    "rand": "ZAR",
    "try": "TRY",
    "₺": "TRY",
    "aed": "AED",
    "dirham": "AED",
    "pln": "PLN",
    "zł": "PLN",
}

_SUFFIX_MULTIPLIERS: Dict[str, float] = {
    "k": 1_000.0,
    "thousand": 1_000.0,
    "m": 1_000_000.0,
    "mm": 1_000_000.0,
    "million": 1_000_000.0,
    "b": 1_000_000_000.0,
    "bn": 1_000_000_000.0,
    "billion": 1_000_000_000.0,
    "t": 1_000_000_000_000.0,
    "tn": 1_000_000_000_000.0,
    "trn": 1_000_000_000_000.0,
    "trillion": 1_000_000_000_000.0,
}

_COUNTRY_ALIASES: Dict[str, str] = {
    "france": "France",
    "germany": "Germany",
    "spain": "Spain",
    "italy": "Italy",
    "belgium": "Belgium",
    "netherlands": "Netherlands",
    "sweden": "Sweden",
    "norway": "Norway",
    "denmark": "Denmark",
    "poland": "Poland",
    "portugal": "Portugal",
    "switzerland": "Switzerland",
    "austria": "Austria",
    "ireland": "Ireland",
    "canada": "Canada",
    "mexico": "Mexico",
    "brazil": "Brazil",
    "india": "India",
    "singapore": "Singapore",
    "australia": "Australia",
    "japan": "Japan",
    "china": "China",
    "united states": "United States",
    "united kingdom": "United Kingdom",
    "england": "United Kingdom",
    "scotland": "United Kingdom",
    "wales": "United Kingdom",
    "uk": "United Kingdom",
    "usa": "United States",
    "u.s.a": "United States",
    "uae": "United Arab Emirates",
    "united arab emirates": "United Arab Emirates",
}

_COUNTRY_REGEXES: Dict[str, re.Pattern[str]] = {}
for alias in _COUNTRY_ALIASES:
    token = alias.strip()
    if not token:
        continue
    if all(char.isalpha() or char.isspace() for char in token):
        pattern = re.compile(rf"\b{re.escape(token)}\b", re.IGNORECASE)
    else:
        pattern = re.compile(re.escape(token), re.IGNORECASE)
    _COUNTRY_REGEXES[alias] = pattern

_CURRENCY_TOKENS = sorted(_CURRENCY_ALIASES.keys(), key=len, reverse=True)
_CURRENCY_TOKEN_GROUP = "|".join(re.escape(token) for token in _CURRENCY_TOKENS)
_AMOUNT_PATTERN = r"\d[\d\s" + _NBSP + r"\.,']*"
_SUFFIX_TOKEN = r"(?:k|m|b|t|mm|bn|tn|trn|million|billion|trillion|thousand)"
_CURRENCY_PATTERNS = [
    re.compile(
        rf"(?P<currency>{_CURRENCY_TOKEN_GROUP})[\s{_NBSP}]*(?P<amount>{_AMOUNT_PATTERN})(?:\s*(?P<suffix>{_SUFFIX_TOKEN})\b)?",
        re.IGNORECASE,
    ),
    re.compile(
        rf"(?P<amount>{_AMOUNT_PATTERN})(?:\s*(?P<suffix>{_SUFFIX_TOKEN})\b)?[\s{_NBSP}]*(?P<currency>{_CURRENCY_TOKEN_GROUP})",
        re.IGNORECASE,
    ),
]


@dataclass(frozen=True)
class ParsedCurrencyAmount:
    amount: float
    currency_code: str
    currency_symbol: str
    match_text: Optional[str] = None

    def as_dict(self) -> Dict[str, object]:
        return {
            "amount": self.amount,
            "currency_code": self.currency_code,
            "currency_symbol": self.currency_symbol,
            "match_text": self.match_text,
        }


def currency_symbol_for(code: Optional[str]) -> str:
    if not code:
        return _CURRENCY_SYMBOLS.get(DEFAULT_CURRENCY_CODE, DEFAULT_CURRENCY_CODE)
    upper = code.upper()
    return _CURRENCY_SYMBOLS.get(upper, upper)


def _normalize_currency_token(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    cleaned = token.strip().lower()
    cleaned = cleaned.replace(".", "")
    return _CURRENCY_ALIASES.get(cleaned)


def _normalize_amount(raw: str) -> Optional[float]:
    value = raw.replace(_NBSP, "").strip()
    value = value.replace(" ", "").replace("'", "")
    comma_count = value.count(",")
    dot_count = value.count(".")
    if comma_count and dot_count:
        value = value.replace(",", "")
    elif comma_count:
        last_group = value.split(",")[-1]
        if comma_count > 1 or len(last_group) == 3:
            value = value.replace(",", "")
        else:
            value = value.replace(",", ".")
    elif dot_count > 1:
        value = value.replace(".", "")
    elif dot_count == 1:
        last_group = value.split(".")[-1]
        if len(last_group) == 3:
            value = value.replace(".", "")
    try:
        return float(value)
    except ValueError:
        return None


def _apply_suffix(amount: float, suffix: Optional[str]) -> float:
    if not suffix:
        return amount
    multiplier = _SUFFIX_MULTIPLIERS.get(suffix.strip().lower())
    if multiplier:
        return amount * multiplier
    return amount


def parse_currency_amount(
    text: Optional[str],
    default_amount: float = DEFAULT_BASE_REVENUE,
    default_currency: str = DEFAULT_CURRENCY_CODE,
) -> ParsedCurrencyAmount:
    if not text:
        symbol = currency_symbol_for(default_currency)
        return ParsedCurrencyAmount(default_amount, default_currency, symbol, None)

    for pattern in _CURRENCY_PATTERNS:
        for match in pattern.finditer(text):
            currency_code = _normalize_currency_token(match.group("currency"))
            if not currency_code:
                continue
            amount_raw = match.group("amount")
            amount_value = _normalize_amount(amount_raw)
            if amount_value is None:
                continue
            suffix = match.group("suffix")
            amount_value = _apply_suffix(amount_value, suffix)
            symbol = currency_symbol_for(currency_code)
            matched_text = match.group(0).strip()
            return ParsedCurrencyAmount(amount_value, currency_code, symbol, matched_text)

    fallback_code = default_currency.upper()
    return ParsedCurrencyAmount(default_amount, fallback_code, currency_symbol_for(fallback_code), None)


def extract_country(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    for alias, pattern in _COUNTRY_REGEXES.items():
        if pattern.search(text):
            return _COUNTRY_ALIASES[alias]
    return None


__all__ = [
    "DEFAULT_BASE_REVENUE",
    "DEFAULT_CURRENCY_CODE",
    "ParsedCurrencyAmount",
    "currency_symbol_for",
    "extract_country",
    "parse_currency_amount",
]
