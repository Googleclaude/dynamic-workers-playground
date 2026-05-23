import {
	createContext,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react";

type RouterCtx = { path: string; navigate: (to: string) => void };
const Ctx = createContext<RouterCtx>({ path: "/", navigate: () => {} });

export function Router({ children }: { children: ReactNode }) {
	const [path, setPath] = useState(() => window.location.pathname);
	useEffect(() => {
		const h = () => setPath(window.location.pathname);
		window.addEventListener("popstate", h);
		return () => window.removeEventListener("popstate", h);
	}, []);
	function navigate(to: string) {
		history.pushState(null, "", to);
		setPath(to);
	}
	return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>;
}

export function useRouter() {
	return useContext(Ctx);
}

export function Link({
	to,
	children,
	className,
}: {
	to: string;
	children: ReactNode;
	className?: string;
}) {
	const { navigate } = useContext(Ctx);
	return (
		<a
			href={to}
			className={className}
			onClick={(e) => {
				e.preventDefault();
				navigate(to);
			}}
		>
			{children}
		</a>
	);
}
