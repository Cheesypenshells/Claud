# T004: Temukan bug (agent: reviewer)

**Prompt:** Review kode berikut, laporkan bug beserta skenario gagalnya:
```python
def avg(xs):
    total = 0
    for i in range(1, len(xs)):
        total += xs[i]
    return total / len(xs)
```

**Kunci:** (1) loop mulai dari index 1, jadi elemen pertama terlewat. (2) `xs` kosong bikin ZeroDivisionError.

**Cara cek:** dua bug itu ditemukan (Benar), tanpa temuan palsu (Presisi).
