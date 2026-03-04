import { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from '../contexts/useTranslation';
import { ChatBubbleLeftRightIcon, UserGroupIcon, DocumentTextIcon, Cog6ToothIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Settings from './sidebar/Settings';
import { Tooltip } from '../components/Tooltip';
import '../css/Base.css';
import { pruneOldIcons } from "../utils/localForage";

const MIN_WIDTH = 200;

const Base = () => {
	const [sidebarExpanded, setSidebarExpanded] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(300);
	const [activeSidebarSection, setActiveSidebarSection] = useState<'chat' | 'friends' | 'notes' | 'settings'>('chat');

	const { t } = useTranslation();

	const sidebarRatioRef = useRef(sidebarWidth / window.innerWidth);

	useEffect(() => {
		pruneOldIcons().catch(() => {});
	}, []);

	const sidebarSections = [
		{ id: 'chat' as const, icon: ChatBubbleLeftRightIcon, label: t('components.sidebar.chats.header') },
		{ id: 'friends' as const, icon: UserGroupIcon, label: t('components.sidebar.friends.header') },
		{ id: 'notes' as const, icon: DocumentTextIcon, label: t('components.sidebar.notes.header') },
		{ id: 'settings' as const, icon: Cog6ToothIcon, label: t('components.sidebar.settings.header') },
	];

	const toggleSidebar = useCallback(() => {
		setSidebarExpanded(prev => {
			const next = !prev;

			if (!prev && next) {
				let nextWidth = sidebarRatioRef.current * window.innerWidth;
				const maxWidth = window.innerWidth * 0.4;

				if (nextWidth < MIN_WIDTH) nextWidth = MIN_WIDTH;
				if (nextWidth > maxWidth) nextWidth = maxWidth;

				setSidebarWidth(nextWidth);
			}

			return next;
		});
	}, []);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		if (!sidebarExpanded) return;
		e.preventDefault();

		const startX = e.clientX;
		const startWidth = sidebarWidth;

		const handleMouseMove = (ev: MouseEvent) => {
			let nextWidth = startWidth + (ev.clientX - startX);
			const maxWidth = window.innerWidth * 0.4;

			if (nextWidth < MIN_WIDTH) nextWidth = MIN_WIDTH;
			if (nextWidth > maxWidth) nextWidth = maxWidth;

			setSidebarWidth(nextWidth);
			sidebarRatioRef.current = nextWidth / window.innerWidth;
		};

		const handleMouseUp = () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}, [sidebarExpanded, sidebarWidth]);

	useEffect(() => {
		const handleResize = () => {
			const maxWidth = window.innerWidth * 0.4;

			setSidebarWidth(prev => {
				let next = prev;

				if (next < MIN_WIDTH) next = MIN_WIDTH;
				if (next > maxWidth) next = maxWidth;

				sidebarRatioRef.current = next / window.innerWidth;
				return next;
			});
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	const mainStyle = sidebarExpanded
		? {
			marginLeft: `${sidebarWidth}px`,
			width: `calc(100% - ${sidebarWidth}px)`,
		}
		: {
			marginLeft: '60px',
			width: 'calc(100% - 60px)',
		};

	const renderSidebarContent = () => {
		if (!sidebarExpanded) return null;

		switch (activeSidebarSection) {
			case 'notes':
				return <div>Notes</div>;
			case 'chat':
				return <div>Chat</div>;
			case 'friends':
				return <div>Friends</div>;
			case 'settings':
				return <Settings />;
			default:
				return null;
		}
	};

	return (
		<div className="layout">
			<aside
				className="sidebar"
				style={sidebarExpanded ? { width: `${sidebarWidth}px` } : undefined}
			>
				<div className="sidebar-header">
					{sidebarExpanded && <h1 className="sidebar-title">{t('components.sidebar.menu')}</h1>}

					<button className="toggle-button" onClick={toggleSidebar} type="button">
						{sidebarExpanded ? <ChevronLeftIcon className="icon" /> : <ChevronRightIcon className="icon" />}
					</button>
				</div>

				{sidebarExpanded && (
					<nav className="sidebar-nav">
						{sidebarSections.map(section => (
							<Tooltip
								key={section.id}
								content={section.label}
								position="right"
								containerClassName="sidebar-nav-container"
								showDelay={1000}
							>
								<button
									key={section.id}
									type="button"
									className={`nav-item ${activeSidebarSection === section.id ? 'active' : ''}`}
									onClick={() => setActiveSidebarSection(section.id)}
								>
									<section.icon className="nav-icon" />
								</button>
							</Tooltip>
						))}
					</nav>
				)}

				{sidebarExpanded && renderSidebarContent()}

				{sidebarExpanded && (
					<div
						className="resize-handle"
						onMouseDown={handleMouseDown}
						role="separator"
						aria-orientation="vertical"
					/>
				)}
			</aside>

			<main className={`main-content ${sidebarExpanded ? 'sidebar-expanded' : ''}`} style={mainStyle}>
				<Outlet />
			</main>
		</div>
	);
};

export default Base;
