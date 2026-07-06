'use client';

import Image from 'next/image';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-white dark:bg-[#0b1424]">
      <div className="absolute inset-0 lg:w-[56%]">
        <div
          className="absolute inset-0 bg-[#8dc63f] max-lg:hidden"
          style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 110px) 100%, 0 100%)' }}
        />
        <div
          className="absolute inset-0 bg-[#0A1F44] lg:[clip-path:polygon(0_0,calc(100%_-_6px)_0,calc(100%_-_116px)_100%,0_100%)]"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 60% 45% at 18% 92%, rgba(141,198,63,0.14), transparent 70%), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 32px 32px, 32px 32px',
          }}
        />
      </div>

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <div className="flex flex-col justify-between px-6 pb-10 pt-8 text-white sm:px-10 lg:min-h-screen lg:w-[56%] lg:px-14 lg:pb-14 lg:pt-12 lg:pr-40">
          <div className="flex items-center gap-3 animate-fade-in">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
              <Image src="/logo.png" alt="3C World Group" width={30} height={30} priority className="h-[30px] w-[30px] object-contain" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-wide">3C World Group</p>
              <p className="text-xs text-white/50">Employee Portal</p>
            </div>
          </div>

          <div className="my-10 max-w-xl lg:my-0">
            <h2 className="portal-display animate-fade-in-up text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              The day starts
              <br />
              <span className="text-[#8dc63f]">here.</span>
            </h2>
            <p className="animate-fade-in-up delay-200 mt-5 max-w-md text-[15px] leading-relaxed text-white/65">
              Your numbers, your team, your next move — all in one place.
            </p>
          </div>

          <div className="animate-fade-in-up delay-300 hidden flex-wrap items-center gap-x-6 gap-y-2 lg:flex">
            {['Live leaderboard', 'Team chat', 'Sales pipeline'].map((item) => (
              <span key={item} className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/50">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8dc63f]" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center px-6 pb-16 sm:px-10 lg:items-center lg:px-14">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-lg shadow-black/20 dark:border-white/10 dark:bg-[#0e1c33] sm:p-8 lg:max-w-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:dark:bg-transparent">
            <div className="flex justify-center lg:block">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
