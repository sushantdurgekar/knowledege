/** A short burst of confetti over the final results (none with reduced motion). */
export function Confetti() {
  const colours = ['#6c4cf5', '#0b8478', '#d63a48', '#e0a100', '#2364c9', '#b0306f'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 48 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 53) % 100}%`,
            background: colours[i % colours.length],
            animationDelay: `${((i * 7) % 20) / 10}s`,
            animationDuration: `${2.6 + ((i * 13) % 14) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}
