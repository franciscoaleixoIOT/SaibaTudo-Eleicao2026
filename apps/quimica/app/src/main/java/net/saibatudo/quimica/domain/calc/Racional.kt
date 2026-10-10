package net.saibatudo.quimica.domain.calc

import java.math.BigInteger

/** Fração exata (BigInteger), sempre reduzida e com denominador positivo. Usada no balanceamento. */
class Racional private constructor(val num: BigInteger, val den: BigInteger) : Comparable<Racional> {

    operator fun plus(o: Racional) = de(num * o.den + o.num * den, den * o.den)
    operator fun minus(o: Racional) = de(num * o.den - o.num * den, den * o.den)
    operator fun times(o: Racional) = de(num * o.num, den * o.den)
    operator fun div(o: Racional): Racional {
        if (o.num.signum() == 0) throw ArithmeticException("divisão por zero")
        return de(num * o.den, den * o.num)
    }
    operator fun unaryMinus() = Racional(num.negate(), den)

    val ehZero: Boolean get() = num.signum() == 0
    val sinal: Int get() = num.signum()

    override fun compareTo(other: Racional): Int = (num * other.den).compareTo(other.num * den)
    override fun equals(other: Any?) = other is Racional && num == other.num && den == other.den
    override fun hashCode() = num.hashCode() * 31 + den.hashCode()
    fun toDouble(): Double = java.math.BigDecimal(num).divide(java.math.BigDecimal(den), java.math.MathContext.DECIMAL64).toDouble()

    /** "3", "-2/3". */
    override fun toString(): String = if (den == BigInteger.ONE) num.toString() else "$num/$den"

    companion object {
        val ZERO = Racional(BigInteger.ZERO, BigInteger.ONE)
        val UM = Racional(BigInteger.ONE, BigInteger.ONE)

        fun de(n: BigInteger, d: BigInteger = BigInteger.ONE): Racional {
            if (d.signum() == 0) throw ArithmeticException("denominador zero")
            if (n.signum() == 0) return ZERO
            val g = n.gcd(d)
            var nn = n / g
            var dd = d / g
            if (dd.signum() < 0) { nn = nn.negate(); dd = dd.negate() }
            return Racional(nn, dd)
        }

        fun de(n: Long, d: Long = 1L) = de(BigInteger.valueOf(n), BigInteger.valueOf(d))
    }
}
