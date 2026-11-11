# T003: Build + fix (agent: builder/fixer)

**Prompt:** Buat `arena/sandbox/fizz.py` dengan fungsi `fizz(n)` yang mengembalikan list string 1..n dengan aturan FizzBuzz, plus test `arena/sandbox/test_fizz.py` (pytest atau assert). Jalankan test-nya.

**Kriteria selesai:**
1. `python3 arena/sandbox/test_fizz.py` (atau `pytest`) lolos.
2. `fizz(15)[-1] == "FizzBuzz"`, `fizz(0) == []`.
3. Nggak ada file lain yang dibuat.

**Cara cek:** jalankan test, lalu `git status`. Hapus `arena/sandbox/` setelah run.
