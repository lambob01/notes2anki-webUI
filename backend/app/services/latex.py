from __future__ import annotations

import re


def clean_latex(text: object) -> str:
    """Scrub AnkiMathJax residue and trim whitespace from model output.

    The model is told to use \\(...\\) / \\[...\\] and never <anki-mathjax>,
    but a provider that slips can smuggle literal tags (or HTML-escaped /
    backslash-escaped variants of them) into a field. Stripping here keeps the
    note type's CSS, not the model, in control of rendering.
    """
    if text is None:
        return ""
    cleaned = str(text)
    cleaned = re.sub(r"</?anki-mathjax[^>]*>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"&lt;/?anki-mathjax.*?&gt;", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"\\?</?anki-mathjax.*?\\?>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    return cleaned.strip()


def _looks_like_math_span(span: str) -> bool:
    """A `$...$` span is math unless it reads like prose or currency.

    Spaced spans need a math indicator (operators, sub/superscripts, escapes)
    so "5 and 10" stays literal; unspaced spans need at least one letter so
    "$5" (currency) stays literal while "$x$", "$pH$", "$[A][B]$" convert.
    """
    if not span.strip():
        return False
    if " " in span:
        return any(c in span for c in "^_\\{}=+-*/<>")
    return any(c.isalpha() for c in span)


def normalize_latex(text: object) -> str:
    """Make LaTeX in any field render in Anki and KaTeX.

    Models default to `$...$` delimiters - which neither Anki's MathJax nor
    the review page's KaTeX render - and JSON round-tripping can leave the
    delimiters double-escaped. Convert both to the `\\(...\\)` / `\\[...\\]`
    forms every renderer here understands.
    """
    if text is None:
        return ""
    cleaned = clean_latex(text)
    cleaned = cleaned.replace(r"\\[", r"\[").replace(r"\\]", r"\]")
    cleaned = cleaned.replace(r"\\(", r"\(").replace(r"\\)", r"\)")
    # Display math first: `$$...$$` is unambiguous math (never currency).
    cleaned = re.sub(r"\$\$([^$\n]+?)\$\$", r"\\[\1\\]", cleaned)
    # `$...$` -> `\(...\)` for spans that look like math; currency and prose
    # ("costs $5 and $10", "total $5") stay literal.
    def _convert(match: re.Match) -> str:
        span = match.group(1)
        return rf"\({span}\)" if _looks_like_math_span(span) else match.group(0)

    return re.sub(r"\$([^$\n]+?)\$", _convert, cleaned)


def format_formula(formula: object) -> str:
    """Normalize a formula field into a single `\\[ ... \\]` display block.

    Model output is inconsistent about delimiters (or drops them entirely),
    and arrow shorthand like `->` is meaningless outside MathJax. This gives
    every stored formula the same canonical shape.
    """
    cleaned = clean_latex(formula)
    # Arrow shorthand is only meaningful inside MathJax-rendered formulas.
    cleaned = cleaned.replace("<->", r"\leftrightarrow").replace("->", r"\rightarrow")
    cleaned = cleaned.replace(r"\\[", r"\[").replace(r"\\]", r"\]")
    cleaned = cleaned.replace(r"\\(", r"\(").replace(r"\\)", r"\)")
    if cleaned and not cleaned.startswith((r"\[", "$$")):
        cleaned = cleaned.replace(r"\(", "").replace(r"\)", "").strip()
        return rf"\[ {cleaned} \]"
    return cleaned
