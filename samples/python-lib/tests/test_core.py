from textstats import average_word_length, char_count, most_common_word, word_count


def test_word_count_counts_whitespace_separated_words() -> None:
    assert word_count("the quick brown fox") == 4


def test_word_count_returns_zero_for_empty_string() -> None:
    assert word_count("") == 0


def test_word_count_collapses_repeated_whitespace() -> None:
    assert word_count("a   b\tc\n\nd") == 4


def test_char_count_includes_whitespace_by_default() -> None:
    assert char_count("a b") == 3


def test_char_count_excludes_whitespace_when_requested() -> None:
    assert char_count("a b\tc", include_whitespace=False) == 3


def test_average_word_length_computes_mean() -> None:
    assert average_word_length("aa bbbb") == 3.0


def test_average_word_length_is_zero_for_empty_string() -> None:
    assert average_word_length("") == 0.0


def test_most_common_word_is_case_insensitive() -> None:
    assert most_common_word("Cat cat dog") == "cat"


def test_most_common_word_returns_none_for_empty_string() -> None:
    assert most_common_word("") is None
