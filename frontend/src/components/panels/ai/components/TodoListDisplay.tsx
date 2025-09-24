import React from 'react';
import { CheckCircle, Circle, ArrowRight, ListTodo } from 'lucide-react';

interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoListDisplayProps {
  todos: Todo[];
  timestamp?: string;
}

export const TodoListDisplay: React.FC<TodoListDisplayProps> = ({ todos }) => {
  const completedCount = todos.filter(t => t.status === 'completed').length;
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
  const totalCount = todos.length;
  
  // Calculate progress percentage
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  return (
    <div className="rounded-lg bg-gradient-to-br from-interactive/10 to-interactive/5 border border-interactive/25 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 bg-interactive/10 border-b border-interactive/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-interactive" />
          <span className="font-semibold text-text-primary text-sm">Task List</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-interactive transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] text-text-secondary font-mono">
              {completedCount}/{totalCount}
            </span>
          </div>
          
          {/* Status badges */}
          {inProgressCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 bg-status-warning/20 text-status-warning rounded-full font-medium">
              {inProgressCount} active
            </span>
          )}
        </div>
      </div>
      
      {/* Todo list */}
      <div className="p-3 space-y-1.5 max-h-96 overflow-y-auto">
        {todos.length === 0 ? (
          <div className="text-center py-4 text-text-tertiary text-sm italic">
            No tasks defined yet
          </div>
        ) : (
          todos.map((todo, idx) => {
            const Icon = 
              todo.status === 'completed' ? CheckCircle :
              todo.status === 'in_progress' ? ArrowRight :
              Circle;
            
            const statusColor = 
              todo.status === 'completed' ? 'text-status-success' :
              todo.status === 'in_progress' ? 'text-status-warning animate-pulse' :
              'text-text-tertiary';
            
            const textStyle = 
              todo.status === 'completed' ? 'line-through text-text-tertiary' :
              todo.status === 'in_progress' ? 'text-text-primary font-medium' :
              'text-text-secondary';
            
            return (
              <div 
                key={todo.id || `todo-${idx}`}
                className={`flex items-start gap-2.5 px-2 py-1 rounded transition-all ${
                  todo.status === 'in_progress' ? 'bg-status-warning/10 border-l-2 border-status-warning' : ''
                }`}
              >
                <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${statusColor}`} />
                <span className={`text-sm flex-1 ${textStyle}`}>
                  {todo.content}
                </span>
                {todo.status === 'in_progress' && (
                  <span className="text-[10px] text-status-warning bg-status-warning/20 px-1.5 py-0.5 rounded">
                    ACTIVE
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};