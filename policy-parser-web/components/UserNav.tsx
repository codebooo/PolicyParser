"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { User, LogOut, Settings, Bell, LayoutDashboard } from "lucide-react";
import { Button } from "./ui/button";

export function UserNav({ user }: { user: any }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
        router.push("/");
    };

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="flex items-center gap-4">
            {/* Notification Button */}
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
                <Bell className="h-5 w-5" />
                <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full animate-pulse"></span>
            </Button>

            {/* Profile Dropdown */}
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 focus:outline-none group"
                >
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-accent p-[1px]">
                        <div className="h-full w-full rounded-full bg-background flex items-center justify-center overflow-hidden">
                            {user.user_metadata?.avatar_url ? (
                                <img src={user.user_metadata.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                            ) : (
                                <span className="font-bold text-primary text-sm">
                                    {user.email?.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>
                </button>

                {isOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-[#0f172a] border border-white/10 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                        <div className="px-4 py-2 border-b border-white/5">
                            <p className="text-sm font-medium text-foreground truncate">{user.email}</p>
                            <p className="text-xs text-muted-foreground">Free Plan</p>
                        </div>

                        <div className="py-1">
                            <Link href="/account">
                                <button className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 flex items-center gap-2 transition-colors">
                                    <LayoutDashboard className="h-4 w-4" />
                                    Dashboard
                                </button>
                            </Link>
                            <Link href="/account">
                                <button className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 flex items-center gap-2 transition-colors">
                                    <Settings className="h-4 w-4" />
                                    Settings
                                </button>
                            </Link>
                        </div>

                        <div className="border-t border-white/5 py-1">
                            <button
                                onClick={handleLogout}
                                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                Log out
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
