"""LaTeX normalization.

The clean_latex/format_formula cases are ported from the notes2anki-v2 CLI,
whose implementations these are copied from; normalize_latex is this app's own
and its currency-vs-math heuristic is the part that actually breaks.
"""

from app.services.latex import clean_latex, format_formula, normalize_latex


def test_clean_latex_strips_mathjax_tags() -> None:
    assert clean_latex("<anki-mathjax>x</anki-mathjax>") == "x"


def test_clean_latex_strips_escaped_mathjax_tags() -> None:
    assert clean_latex("&lt;anki-mathjax&gt;x&lt;/anki-mathjax&gt;") == "x"


def test_clean_latex_preserves_arrows_in_prose() -> None:
    assert clean_latex("glucose -> pyruvate") == "glucose -> pyruvate"
    assert clean_latex("A <-> B") == "A <-> B"


def test_clean_latex_handles_none() -> None:
    assert clean_latex(None) == ""


def test_format_formula_replaces_arrows() -> None:
    assert format_formula("a -> b") == r"\[ a \rightarrow b \]"
    assert format_formula("a <-> b") == r"\[ a \leftrightarrow b \]"


def test_format_formula_wraps_bare_formula() -> None:
    assert format_formula("x=y") == r"\[ x=y \]"


def test_format_formula_keeps_existing_display_math() -> None:
    assert format_formula(r"\[ x=y \]") == r"\[ x=y \]"


def test_format_formula_empty() -> None:
    assert format_formula("") == ""
    assert format_formula(None) == ""


def test_normalize_latex_converts_display_math() -> None:
    assert normalize_latex("$$E=mc^2$$") == r"\[E=mc^2\]"


def test_normalize_latex_converts_inline_math() -> None:
    assert normalize_latex("Solve $x$ now") == r"Solve \(x\) now"
    assert normalize_latex("$pH$") == r"\(pH\)"


def test_normalize_latex_leaves_currency_alone() -> None:
    # The span between the two $ is "5 and " - spaced, with no math operator,
    # so it stays literal instead of becoming \(5 and \).
    assert normalize_latex("costs $5 and $10") == "costs $5 and $10"


def test_normalize_latex_undoubles_escaped_delimiters() -> None:
    assert normalize_latex(r"\\(x\\)") == r"\(x\)"
    assert normalize_latex(r"\\[x\\]") == r"\[x\]"
