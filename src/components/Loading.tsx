interface LoadingProps {
    vCentered: boolean;
    tiny?: boolean;
  }

  const Loading: React.FC<LoadingProps> = (props: LoadingProps) => {
    if (props.tiny) {
        return (
            <div className="flex items-center justify-center" role="status" aria-label="Loading">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-500/30 border-t-violet-500"></div>
            </div>
        );
    }
    return (
        <div className={props.vCentered ? "flex items-center justify-center h-screen" : "flex items-center justify-center py-8"} role="status" aria-label="Loading">
            <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500/30 border-t-violet-500"></div>
                <span className="text-xs text-gray-500">Loading...</span>
            </div>
        </div>
    );
  }
  
  export default Loading;
